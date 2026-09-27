#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const hash = value => createHash('sha256').update(value).digest('hex');
function git(args, cwd) {
  return execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
}
const MAX_SNAPSHOT_BYTES = 256 * 1024 * 1024;
const MAX_BLOB_BYTES = 16 * 1024 * 1024;
const MAX_TREE_ENTRIES = 50000;
function treeEntries(root,revision) {
  const output = new TextDecoder('utf-8',{fatal:true}).decode(execFileSync('git',['ls-tree','-r','-z',revision],{cwd:root,stdio:['ignore','pipe','ignore'],maxBuffer:32*1024*1024}));
  const names = new Map(), files = new Set(), directories = new Set();
  return output.split('\0').filter(Boolean).map(entry => {
    const tab = entry.indexOf('\t');
    if (tab < 0) throw Error('invalid Git tree entry');
    const [mode,type,oid] = entry.slice(0,tab).split(' ');
    const file=entry.slice(tab+1);
    const parts=file.split('/');
    if (!/^(?:100644|100755)$/.test(mode) || type !== 'blob' || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(oid) ||
        !file || file.startsWith('/') || file.includes('\\') || /[\0-\x1f\x7f]/.test(file) ||
        parts.some(part=>!part || part==='.' || part==='..' || /[ .]$/.test(part))) {
      throw Error('unsupported tracked entry');
    }
    let prefix='';
    for (let index=0;index<parts.length;index++) {
      prefix=prefix ? `${prefix}/${parts[index]}` : parts[index];
      const key=prefix.normalize('NFC').toLowerCase();
      const existing=names.get(key);
      if (existing !== undefined && existing !== prefix) throw Error('case-colliding tracked paths');
      if (index < parts.length-1) {
        if (files.has(key)) throw Error('file and directory path collision');
        directories.add(key);
      } else {
        if (files.has(key) || directories.has(key)) throw Error('duplicate or conflicting tracked path');
        files.add(key);
      }
    }
    if (files.size > MAX_TREE_ENTRIES) throw Error('tracked tree exceeds snapshot limit');
    return {file,oid,mode};
  });
}
function objectFormat(root) {
  const algorithm = git(['rev-parse','--show-object-format'],root);
  if (algorithm !== 'sha1' && algorithm !== 'sha256') throw Error('unsupported Git object format');
  return algorithm;
}
function matchesBlob(file,oid,mode,algorithm,chunk) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || Boolean(stat.mode & 0o111) !== (mode === '100755')) return false;
  const digest = createHash(algorithm).update(`blob ${stat.size}\0`);
  const fd = fs.openSync(file,'r');
  try {
    let remaining = stat.size;
    while (remaining > 0) {
      const count = fs.readSync(fd,chunk,0,Math.min(chunk.length,remaining));
      if (!count) return false;
      digest.update(chunk.subarray(0,count));
      remaining -= count;
    }
  } finally { fs.closeSync(fd); }
  return digest.digest('hex') === oid;
}
export function sourceMatchesRevision(root,revision) {
  try {
    if (git(['rev-parse','HEAD'],root) !== revision || git(['ls-files','--others','--exclude-standard','-z'],root)) return false;
    const entries = treeEntries(root,revision);
    const algorithm = objectFormat(root), chunk = Buffer.allocUnsafe(64 * 1024);
    return entries.every(({file,oid,mode}) => matchesBlob(path.join(root,file),oid,mode,algorithm,chunk));
  } catch { return false; }
}
function headSnapshot(root,revision) {
  const entries = treeEntries(root,revision);
  const algorithm = objectFormat(root);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'security-check-head-'));
  const checkout = path.join(temp,'checkout');
  try {
    fs.mkdirSync(checkout);
    let totalBytes=0;
    const chunk = Buffer.allocUnsafe(64 * 1024);
    for (const {file,oid,mode} of entries) {
      const bytes=execFileSync('git',['cat-file','blob',oid],{cwd:root,stdio:['ignore','pipe','ignore'],maxBuffer:MAX_BLOB_BYTES+1});
      totalBytes+=bytes.length;
      if (bytes.length>MAX_BLOB_BYTES || totalBytes>MAX_SNAPSHOT_BYTES) throw Error('HEAD snapshot exceeds size limit');
      const target=path.join(checkout,...file.split('/'));
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.writeFileSync(target,bytes,{flag:'wx',mode:mode==='100755'?0o755:0o644});
      fs.chmodSync(target,mode==='100755'?0o755:0o644);
      if (!matchesBlob(target,oid,mode,algorithm,chunk)) throw Error('HEAD blob verification failed');
    }
    return {checkout,files:entries.map(entry => entry.file),dispose:() => fs.rmSync(temp,{recursive:true,force:true})};
  } catch (error) {
    fs.rmSync(temp,{recursive:true,force:true});
    throw error;
  }
}
export function canonicalRepository(remote) {
  const value = remote.trim().replace(/^git@([^:]+):/, 'ssh://git@$1/');
  const url = new URL(value);
  if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol) || !url.hostname) throw new Error('unsupported origin repository URL');
  const pathname = url.pathname.replace(/\/+$/, '').replace(/\.git$/, '');
  if (!pathname || pathname === '/') throw new Error('origin repository path is missing');
  return `https://${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ''}${pathname}`;
}
function relativeFile(root, file) {
  if (typeof file !== 'string' || !file) return null;
  const relative = path.relative(root, path.resolve(root, file)).split(path.sep).join('/');
  return relative && relative !== '..' && !relative.startsWith('../') ? relative : null;
}
function localSourceTarget(root,file) {
  const relative = relativeFile(root,file);
  if (!relative) return false;
  try { return fs.statSync(path.join(root,relative)).isFile(); }
  catch { return false; }
}
function sourceLineCount(file) {
  const fd = fs.openSync(file,'r');
  const chunk = Buffer.allocUnsafe(64 * 1024);
  let lines = 0, last;
  try {
    let length;
    while ((length = fs.readSync(fd,chunk,0,chunk.length,null)) > 0) {
      for (let index=0;index<length;index++) if (chunk[index] === 10) lines++;
      last = chunk[length - 1];
    }
  } finally { fs.closeSync(fd); }
  return lines + (last !== undefined && last !== 10 ? 1 : 0);
}
function finding({root, revision, repository, scanner, rule, file, line, severity, message}) {
  const pathName = relativeFile(root, file);
  if (!pathName || !Number.isSafeInteger(line) || line < 1 || typeof rule !== 'string' || !rule) return null;
  const findingId = hash([repository, revision, scanner, rule, pathName, line].join('\0'));
  return {schema_version: 1, finding_id: findingId, repository, revision, rule_id: rule, path: pathName, line, severity: String(severity ?? 'UNKNOWN').toUpperCase(), scanner, message, evidence_ref: `sha256:${hash([scanner, rule, pathName, line].join('\0'))}`};
}
function lane({name, scanner = name, version, result, parse, root, revision, repository, allowFindingExit = false}) {
  let valid = true;
  let located = true;
  const findings = [];
  const fileFindings = [];
  const lineCounts = new Map();
  try {
    parse(JSON.parse(result.stdout ?? ''), item => {
      const current = scanner !== 'gitleaks';
      if (current && !localSourceTarget(root,item.file)) { valid = false; return; }
      const relative = current ? relativeFile(root,item.file) : null;
      let cited = Number.isSafeInteger(item.line) && item.line > 0;
      if (current && cited) {
        try {
          if (!lineCounts.has(relative)) lineCounts.set(relative,sourceLineCount(path.join(root,relative)));
          cited = item.line <= lineCounts.get(relative);
        } catch { valid = false; return; }
      }
      if (scanner.startsWith('trivy_') && !cited) {
        const file = relativeFile(root, item.file);
        if (file && typeof item.rule === 'string' && /^[A-Za-z0-9._:-]{1,120}$/.test(item.rule)) {
          fileFindings.push({repository, revision, scanner, rule_id:item.rule, path:file,
            severity:String(item.severity ?? 'UNKNOWN').toUpperCase(), message:'Finding reported by Trivy without a source line'});
          located = false;
        } else valid = false;
        return;
      }
      if (!cited) { valid = false; return; }
      const value = finding({root, revision, repository, scanner, ...item});
      if (!value) valid = false; else findings.push(value);
    });
  } catch { valid = false; }
  const successful = valid && !result.error && (result.status === 0 || (allowFindingExit && result.status === 1 && findings.length > 0));
  findings.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.rule_id.localeCompare(b.rule_id));
  fileFindings.sort((a, b) => a.path.localeCompare(b.path) || a.rule_id.localeCompare(b.rule_id));
  return {tool: {name, version: version ?? null, status: successful ? 'ok' : result.error?.code === 'ENOENT' ? 'unavailable' : 'failed', exit_code: result.status ?? null},
    coverage: successful && located ? 'complete' : 'incomplete', findings, ...(fileFindings.length ? {file_findings:fileFindings} : {})};
}
const semgrepParse = (report, add) => {
  if (!Array.isArray(report.results) || (report.errors !== undefined && (!Array.isArray(report.errors) || report.errors.length))) throw Error();
  for (const x of report.results) add({rule:x.check_id,file:x.path,line:x.start?.line,severity:x.extra?.severity,message:'Finding reported by Semgrep'});
  return [];
};
const gitleaksParse = (report, add) => {
  if (!Array.isArray(report)) throw Error();
  for (const x of report) add({rule:x.RuleID,file:x.File,line:x.StartLine,severity:'HIGH',message:'Secret detected by Gitleaks'});
};
export function normalize({root, revision, repository, semgrepVersion, result}) {
  return lane({name:'semgrep',version:semgrepVersion,result,parse:semgrepParse,root,revision,repository});
}
const trivyParse = (report, add) => {
  if (!report || (report.Results !== null && !Array.isArray(report.Results))) throw Error();
  for (const result of report.Results ?? []) {
    for (const list of [result.Misconfigurations, result.Vulnerabilities]) {
      if (list == null) continue;
      if (!Array.isArray(list)) throw Error();
      for (const item of list) {
        const line = [item.CauseMetadata?.StartLine, item.CauseMetadata?.Code?.Lines?.[0]?.Number, item.Code?.Lines?.[0]?.Number]
          .find(value => Number.isSafeInteger(value) && value > 0);
        add({rule:item.ID ?? item.VulnerabilityID ?? item.Type ?? 'trivy-finding',
          file:result.Target,line,severity:item.Severity,message:'Finding reported by Trivy'});
      }
    }
  }
};
const hadolintParse = (report, add) => {
  if (!Array.isArray(report)) throw Error();
  for (const x of report) add({rule:x.code,file:x.file,line:x.line,severity:x.level,message:'Finding reported by Hadolint'});
  return [];
};
const actionlintParse = (report, add) => {
  if (!Array.isArray(report)) throw Error();
  for (const x of report) add({rule:x.kind ?? 'actionlint',file:x.filepath ?? x.file,line:x.line,severity:'ERROR',message:'Finding reported by actionlint'});
};
function unavailable(name, exit_code = null) { return {tool:{name,version:null,status:'unavailable',exit_code},coverage:'incomplete',findings:[]}; }
function incompleteReport(repository, revision, error) {
  return {schema_version:1,repository,revision,scanner:'semgrep',tool:unavailable('semgrep').tool,
    secret_coverage:'incomplete',secret_tool:unavailable('gitleaks').tool,lanes:{},
    coverage:'incomplete',findings:[],error};
}
export function run({cwd = process.cwd(), spawn = spawnSync} = {}) {
  let repository, revision;
  try { revision=git(['rev-parse','HEAD'],cwd); repository=canonicalRepository(git(['config','--get','remote.origin.url'],cwd)); }
  catch { return incompleteReport(null, null, 'repository identity unavailable'); }
  let snapshot;
  try { snapshot=headSnapshot(cwd,revision); }
  catch { return incompleteReport(repository, revision, 'HEAD snapshot unavailable or contains unsafe tracked entries; scanners not run'); }
  try {
  const specs=[
    ['semgrep','semgrep',['--version'],['scan','--json','--config','p/default','--metrics=off','--disable-version-check','.'],semgrepParse],
    ['gitleaks','gitleaks',['version'],['git','--log-opts',revision,'--report-format','json','--report-path','/dev/stdout','--redact=100','--exit-code','0','--no-banner','.'],gitleaksParse],
    ['trivy_config','trivy',['--version'],['config','--format','json','--skip-check-update','--disable-telemetry','--skip-version-check','.'],trivyParse],
    ['trivy_fs','trivy',['--version'],['fs','--format','json','--scanners','vuln','--skip-db-update','--skip-java-db-update','--skip-vex-repo-update','--offline-scan','--disable-telemetry','--skip-version-check','.'],trivyParse],
    ['hadolint','hadolint',['--version'],['--format','json','--no-fail'],hadolintParse],
    ['actionlint','actionlint',['--version'],['-format','{{json .}}'],actionlintParse],
  ];
  const lanes={};
  for (const [key,bin,versionArgs,scanArgs,parse] of specs) {
    const v=spawn(bin,versionArgs,{cwd:key==='gitleaks'?cwd:snapshot.checkout,encoding:'utf8',timeout:15000});
    const version=v.status===0 ? String(v.stdout??'').trim() : null;
    if (!version) { lanes[key]=v.error?.code === 'ENOENT' ? unavailable(bin,v.status) : {tool:{name:bin,version:null,status:'failed',exit_code:v.status??null},coverage:'incomplete',findings:[]}; continue; }
    let args=scanArgs;
    if (key === 'actionlint') {
      const workflows=snapshot.files.filter(file => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file));
      if (workflows.length === 0) {
        lanes[key]=lane({name:bin,scanner:key,version,result:{status:0,stdout:'[]'},parse,root:snapshot.checkout,revision,repository});
        continue;
      }
      args=[...scanArgs,...workflows];
    }
    if (key === 'hadolint') {
      const dockerfiles=snapshot.files.filter(file=>/(^|\/)(?:Dockerfile(?:\..*)?|[^/]+\.Dockerfile)$/.test(file));
      if (dockerfiles.length === 0) {
        lanes[key]=lane({name:bin,scanner:key,version,result:{status:0,stdout:'[]'},parse,root:snapshot.checkout,revision,repository});
        continue;
      }
      args=[...scanArgs,...dockerfiles];
    }
    const result=spawn(bin,args,{cwd:key==='gitleaks'?cwd:snapshot.checkout,encoding:'utf8',maxBuffer:32*1024*1024,timeout:300000});
    lanes[key]=lane({name:bin,scanner:key,version,result,parse,root:key==='gitleaks'?cwd:snapshot.checkout,revision,repository,allowFindingExit:key==='actionlint'});
  }
  const legacy=lanes.semgrep, secrets=lanes.gitleaks;
  const findings=Object.values(lanes).flatMap(x=>x.findings).sort((a,b)=>a.path.localeCompare(b.path)||a.line-b.line||a.rule_id.localeCompare(b.rule_id)||a.scanner.localeCompare(b.scanner));
  const fileFindings=Object.values(lanes).flatMap(x=>x.file_findings ?? []);
  const report={schema_version:1,repository,revision,scanner:'semgrep',tool:legacy.tool,secret_coverage:secrets.coverage,secret_tool:secrets.tool,lanes,coverage:Object.values(lanes).every(x=>x.coverage==='complete')?'complete':'incomplete',findings,...(fileFindings.length ? {file_findings:fileFindings} : {})};
  const incomplete=Object.entries(lanes).filter(([,value])=>value.coverage==='incomplete').map(([key])=>({semgrep:'Semgrep',gitleaks:'Gitleaks',trivy_config:'Trivy config',trivy_fs:'Trivy fs',hadolint:'Hadolint',actionlint:'actionlint'}[key]));
  if (incomplete.length) report.error=incomplete.map(name=>`${name} unavailable, failed, returned invalid JSON, or lacked a source line`).join('; ');
  return report;
  } finally { snapshot.dispose(); }
}
function help() { console.log('Usage: node security-check.mjs [--root PATH]\nRuns opt-in scanners and emits one normalized JSON report. Exit 0 only when every lane is complete. Tools must already be installed; Trivy requires a local database and runs without database or check updates.'); }
const invoked=(()=>{try{return process.argv[1]&&fs.realpathSync(fileURLToPath(import.meta.url))===fs.realpathSync(process.argv[1]);}catch{return false;}})();
if(invoked){if(process.argv.includes('--help')){help();process.exit(0);}let cwd=process.cwd();if(process.argv.length>2){if(process.argv.length!==4||process.argv[2]!=='--root'){console.error('invalid arguments');help();process.exit(2);}cwd=path.resolve(process.argv[3]);}const report=run({cwd});console.log(JSON.stringify(report));process.exit(report.coverage==='complete'?0:1);}
