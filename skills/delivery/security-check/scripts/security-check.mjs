#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const hash = value => createHash('sha256').update(value).digest('hex');
function git(args, cwd) {
  return execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
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
  try {
    parse(JSON.parse(result.stdout ?? ''), item => {
      if (scanner.startsWith('trivy_') && !Number.isSafeInteger(item.line)) {
        const file = relativeFile(root, item.file);
        if (file && typeof item.rule === 'string' && /^[A-Za-z0-9._:-]{1,120}$/.test(item.rule)) {
          fileFindings.push({repository, revision, scanner, rule_id:item.rule, path:file,
            severity:String(item.severity ?? 'UNKNOWN').toUpperCase(), message:'Finding reported by Trivy without a source line'});
          located = false;
        } else valid = false;
        return;
      }
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
      for (const item of list) add({rule:item.ID ?? item.VulnerabilityID ?? item.Type ?? 'trivy-finding',
        file:result.Target,line:item.Code?.Lines?.[0]?.Number,severity:item.Severity,message:'Finding reported by Trivy'});
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
  let clean;
  try { clean=git(['status','--porcelain=v1','-z','--untracked-files=all'],cwd)===''; }
  catch { return incompleteReport(repository, revision, 'working tree cleanliness unavailable; scanners not run'); }
  if (!clean) return incompleteReport(repository, revision, 'working tree has uncommitted files; scanners not run');
  const specs=[
    ['semgrep','semgrep',['--version'],['scan','--json','--config','p/default','--metrics=off','--disable-version-check','.'],semgrepParse],
    ['gitleaks','gitleaks',['version'],['git','--report-format','json','--report-path','/dev/stdout','--redact=100','--exit-code','0','--no-banner','.'],gitleaksParse],
    ['trivy_config','trivy',['--version'],['config','--format','json','--skip-check-update','--disable-telemetry','--skip-version-check','.'],trivyParse],
    ['trivy_fs','trivy',['--version'],['fs','--format','json','--scanners','vuln','--skip-db-update','--skip-java-db-update','--skip-vex-repo-update','--offline-scan','--disable-telemetry','--skip-version-check','.'],trivyParse],
    ['hadolint','hadolint',['--version'],['--format','json','--no-fail'],hadolintParse],
    ['actionlint','actionlint',['--version'],['-format','{{json .}}'],actionlintParse],
  ];
  const lanes={};
  for (const [key,bin,versionArgs,scanArgs,parse] of specs) {
    const v=spawn(bin,versionArgs,{cwd,encoding:'utf8',timeout:15000});
    const version=v.status===0 ? String(v.stdout??'').trim() : null;
    if (!version) { lanes[key]=v.error?.code === 'ENOENT' ? unavailable(bin,v.status) : {tool:{name:bin,version:null,status:'failed',exit_code:v.status??null},coverage:'incomplete',findings:[]}; continue; }
    let args=scanArgs;
    if (key === 'hadolint') {
      const dockerfiles=git(['ls-files','--','Dockerfile','**/Dockerfile','Dockerfile.*','**/Dockerfile.*'],cwd).split('\n').filter(file=>file && /(^|\/)Dockerfile(?:\..*)?$/.test(file));
      if (dockerfiles.length === 0) {
        lanes[key]=lane({name:bin,scanner:key,version,result:{status:0,stdout:'[]'},parse,root:cwd,revision,repository});
        continue;
      }
      args=[...scanArgs,...dockerfiles];
    }
    const result=spawn(bin,args,{cwd,encoding:'utf8',maxBuffer:32*1024*1024,timeout:300000});
    lanes[key]=lane({name:bin,scanner:key,version,result,parse,root:cwd,revision,repository,allowFindingExit:key==='actionlint'});
  }
  const legacy=lanes.semgrep, secrets=lanes.gitleaks;
  const findings=Object.values(lanes).flatMap(x=>x.findings).sort((a,b)=>a.path.localeCompare(b.path)||a.line-b.line||a.rule_id.localeCompare(b.rule_id)||a.scanner.localeCompare(b.scanner));
  const fileFindings=Object.values(lanes).flatMap(x=>x.file_findings ?? []);
  const report={schema_version:1,repository,revision,scanner:'semgrep',tool:legacy.tool,secret_coverage:secrets.coverage,secret_tool:secrets.tool,lanes,coverage:Object.values(lanes).every(x=>x.coverage==='complete')?'complete':'incomplete',findings,...(fileFindings.length ? {file_findings:fileFindings} : {})};
  const incomplete=Object.entries(lanes).filter(([,value])=>value.coverage==='incomplete').map(([key])=>({semgrep:'Semgrep',gitleaks:'Gitleaks',trivy_config:'Trivy config',trivy_fs:'Trivy fs',hadolint:'Hadolint',actionlint:'actionlint'}[key]));
  if (incomplete.length) report.error=incomplete.map(name=>`${name} unavailable, failed, returned invalid JSON, or lacked a source line`).join('; ');
  return report;
}
function help() { console.log('Usage: node security-check.mjs [--root PATH]\nRuns opt-in scanners and emits one normalized JSON report. Exit 0 only when every lane is complete. Tools must already be installed; Trivy requires a local database and runs without database or check updates.'); }
const invoked=(()=>{try{return process.argv[1]&&fs.realpathSync(fileURLToPath(import.meta.url))===fs.realpathSync(process.argv[1]);}catch{return false;}})();
if(invoked){if(process.argv.includes('--help')){help();process.exit(0);}let cwd=process.cwd();if(process.argv.length>2){if(process.argv.length!==4||process.argv[2]!=='--root'){console.error('invalid arguments');help();process.exit(2);}cwd=path.resolve(process.argv[3]);}const report=run({cwd});console.log(JSON.stringify(report));process.exit(report.coverage==='complete'?0:1);}
