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
function finding({root, revision, repository, scanner, rule, file, line, severity, message}) {
  const pathName = path.relative(root, path.resolve(root, file)).split(path.sep).join('/');
  if (!pathName || pathName === '..' || pathName.startsWith('../') || !Number.isSafeInteger(line) || line < 1 || typeof rule !== 'string' || !rule) return null;
  const findingId = hash([repository, revision, scanner, rule, pathName, line].join('\0'));
  return {schema_version: 1, finding_id: findingId, repository, revision, rule_id: rule, path: pathName, line, severity: String(severity ?? 'UNKNOWN').toUpperCase(), scanner, message, evidence_ref: `sha256:${hash([scanner, rule, pathName, line].join('\0'))}`};
}
function lane({name, scanner = name, version, result, parse, root, revision, repository}) {
  let valid = true;
  const findings = [];
  try { parse(JSON.parse(result.stdout ?? ''), item => { const value = finding({root, revision, repository, scanner, ...item}); if (!value) valid = false; else findings.push(value); }); } catch { valid = false; }
  const successful = result.status === 0 && !result.error && valid;
  findings.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.rule_id.localeCompare(b.rule_id));
  return {tool: {name, version: version ?? null, status: successful ? 'ok' : result.error?.code === 'ENOENT' ? 'unavailable' : 'failed', exit_code: result.status ?? null}, coverage: successful ? 'complete' : 'incomplete', findings};
}
const semgrepParse = (report, add) => {
  if (!Array.isArray(report.results) || (report.errors !== undefined && (!Array.isArray(report.errors) || report.errors.length))) throw Error();
  for (const x of report.results) add({rule:x.check_id,file:x.path,line:x.start?.line,severity:x.extra?.severity,message:'Finding reported by Semgrep'});
  return [];
};
export function normalize({root, revision, repository, semgrepVersion, result}) {
  return lane({name:'semgrep',version:semgrepVersion,result,parse:semgrepParse,root,revision,repository});
}
const trivyParse = (report, add) => {
  if (report.Results !== null && !Array.isArray(report.Results)) throw Error();
  for (const r of report.Results ?? []) {
    const list = r.Misconfigurations ?? r.Vulnerabilities ?? [];
    if (!Array.isArray(list)) throw Error();
    for (const x of list) add({rule:x.ID ?? x.Type ?? 'trivy-finding',file:r.Target,line:x.Code?.Lines?.[0]?.Number ?? 1,severity:x.Severity,message:'Finding reported by Trivy'});
  }
  return [];
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
export function run({cwd = process.cwd(), spawn = spawnSync} = {}) {
  let repository, revision;
  try { revision=git(['rev-parse','HEAD'],cwd); repository=canonicalRepository(git(['config','--get','remote.origin.url'],cwd)); }
  catch { return {schema_version:1,repository:null,revision:null,lanes:{},coverage:'incomplete',findings:[],error:'repository identity unavailable'}; }
  let clean;
  try { clean=git(['status','--porcelain=v1','-z','--untracked-files=all'],cwd)===''; } catch { clean=false; }
  const specs=[
    ['semgrep','semgrep',['--version'],['scan','--json','--config','p/default','--metrics=off','--disable-version-check','.'],semgrepParse],
    ['gitleaks','gitleaks',['version'],['git','--report-format','json','--report-path','/dev/stdout','--redact=100','--exit-code','0','--no-banner','.'],gitleaksParse],
    ['trivy_config','trivy',['--version'],['config','--format','json','--skip-check-update','--skip-db-update','--offline-scan','.'],trivyParse],
    ['trivy_fs','trivy',['--version'],['fs','--format','json','--skip-db-update','--skip-java-db-update','--offline-scan','.'],trivyParse],
    ['hadolint','hadolint',['--version'],['--format','json'],hadolintParse],
    ['actionlint','actionlint',['--version'],['-format','{{json .}}'],actionlintParse],
  ];
  const lanes={};
  for (const [key,bin,versionArgs,scanArgs,parse] of specs) {
    if (!clean) { lanes[key]=unavailable(bin); continue; }
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
    lanes[key]=lane({name:bin,scanner:key,version,result,parse,root:cwd,revision,repository});
  }
  const legacy=lanes.semgrep, secrets=lanes.gitleaks;
  const findings=Object.values(lanes).flatMap(x=>x.findings).sort((a,b)=>a.path.localeCompare(b.path)||a.line-b.line||a.rule_id.localeCompare(b.rule_id)||a.scanner.localeCompare(b.scanner));
  const report={schema_version:1,repository,revision,scanner:'semgrep',tool:legacy.tool,secret_coverage:secrets.coverage,secret_tool:secrets.tool,lanes,coverage:Object.values(lanes).every(x=>x.coverage==='complete')?'complete':'incomplete',findings};
  const incomplete=Object.entries(lanes).filter(([,value])=>value.coverage==='incomplete').map(([key])=>({semgrep:'Semgrep',gitleaks:'Gitleaks',trivy_config:'Trivy config',trivy_fs:'Trivy fs',hadolint:'Hadolint',actionlint:'actionlint'}[key]));
  if (incomplete.length) report.error=incomplete.map(name=>`${name} unavailable, failed, or returned invalid JSON`).join('; ');
  return report;
}
function help() { console.log('Usage: node security-check.mjs [--root PATH]\nRuns opt-in scanners and emits one normalized JSON report. Exit 0 only when every lane is complete. Tools must already be installed; Trivy requires a local database and runs without database or check updates.'); }
const invoked=(()=>{try{return process.argv[1]&&fs.realpathSync(fileURLToPath(import.meta.url))===fs.realpathSync(process.argv[1]);}catch{return false;}})();
if(invoked){if(process.argv.includes('--help')){help();process.exit(0);}let cwd=process.cwd();if(process.argv.length>2){if(process.argv.length!==4||process.argv[2]!=='--root'){console.error('invalid arguments');help();process.exit(2);}cwd=path.resolve(process.argv[3]);}const report=run({cwd});console.log(JSON.stringify(report));process.exit(report.coverage==='complete'?0:1);}
