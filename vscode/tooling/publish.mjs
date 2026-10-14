import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkComponent } from '../.release/check.cjs';
import { verifyVsix } from '../.release/vsix.cjs';
import { previewArguments } from './release-policy.cjs';

// Fail before credentials/network use. Filename comes from the validated target,
// not a stale hard-coded version. vsce owns VSIX manifest/version validation.
const root=fileURLToPath(new URL('../',import.meta.url));
const errors=checkComponent(root,{ready:true,installed:true});
if(errors.length) throw new Error(errors.join('\n'));
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const filename=path.join(root,pkg.name+'-'+pkg.version+'.vsix');
await verifyVsix(filename,root);
const target=JSON.parse(await readFile(path.join(root,'.release/target.json'),'utf8'));
const cli=fileURLToPath(import.meta.resolve('@vscode/vsce/vsce'));
const result=spawnSync(process.execPath,[cli,'publish','--packagePath',filename,...previewArguments(target)],{stdio:'inherit'});
if(result.error) throw result.error;
process.exitCode=result.status??1;
