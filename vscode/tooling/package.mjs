import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkComponent } from '../.release/check.cjs';

// Channel selection comes from the same projection as the numeric VSIX identity.
const root=fileURLToPath(new URL('../',import.meta.url));
const errors=checkComponent(root,{ready:true,installed:true});
if(errors.length) throw new Error(errors.join('\n'));
const target=JSON.parse(await readFile(new URL('../.release/target.json',import.meta.url),'utf8'));
const cli=fileURLToPath(import.meta.resolve('@vscode/vsce/vsce'));
const result=spawnSync(process.execPath,[cli,'package','--no-dependencies',...(target.channel==='alpha'?['--pre-release']:[])],{cwd:root,stdio:'inherit'});
if(result.error) throw result.error;
process.exitCode=result.status??1;
