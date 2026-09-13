import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import test from "node:test";
import {assertReleaseRef,verifyArtifact,registryState,publishArtifact} from "../tooling/npm-release.mjs";

const release={name:"@drawmotive/markdown-it-textgraph",version:"0.2.0",tag:"latest",gitTag:"markdown-v0.2.0",filename:"drawmotive-markdown-it-textgraph-0.2.0.tgz",integrity:"sha512-example"};
const commit="a".repeat(40);
test("release identity requires the package tag, repository and immutable Actions commit",()=>{
 const env={GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"drawmotive/markdown-textgraph",GITHUB_REF:"refs/tags/markdown-v0.2.0",GITHUB_SHA:commit};
 assert.doesNotThrow(()=>assertReleaseRef(release,commit,env));
 for(const override of [{GITHUB_ACTIONS:"false"},{GITHUB_REF:"refs/heads/main"},{GITHUB_REPOSITORY:"other/repo"},{GITHUB_SHA:"b".repeat(40)}])assert.throws(()=>assertReleaseRef(release,commit,{...env,...override}));
});
test("artifact receipt rejects tampered bytes and a different producer commit",async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),"markdown-release-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const bytes=Buffer.from("verified archive");
 const receipt={...release,commit,integrity:"sha512-"+createHash("sha512").update(bytes).digest("base64")};
 await writeFile(path.join(dir,release.filename),bytes);await writeFile(path.join(dir,"npm-release.json"),JSON.stringify(receipt));
 assert.deepEqual(await verifyArtifact(dir,release,commit),receipt);
 await assert.rejects(verifyArtifact(dir,release,"b".repeat(40)),/commit mismatch/);
 await writeFile(path.join(dir,release.filename),"different");
 await assert.rejects(verifyArtifact(dir,release,commit),/integrity mismatch/);
});
test("registry verification reads the exact version and rejects conflicting immutable bytes",async()=>{
 const requests=[];
 const fetch=async url=>{requests.push(url);return Response.json(url.endsWith("dist-tags")?{latest:"0.2.0"}:{name:release.name,version:release.version,dist:{integrity:release.integrity}});};
 assert.deepEqual(await registryState(release,fetch),{published:true,tagged:true});
 assert.match(requests[0],/0[.]2[.]0$/);
 await assert.rejects(registryState(release,async()=>Response.json({name:release.name,version:release.version,dist:{integrity:"wrong"}})),/integrity mismatch/);
 assert.deepEqual(await registryState(release,async()=>new Response(null,{status:404})),{published:false});
});
test("publication sends the exact retained artifact once and waits for registry visibility",async()=>{
 let reads=0;const calls=[];
 const status=await publishArtifact(release,"/release",{run:async args=>calls.push(args),readState:async()=>++reads<3?{published:false}:{published:true,tagged:true},delay:async()=>{}});
 assert.equal(status,"published");assert.equal(calls.length,1);
 assert.equal(calls[0][1],path.join("/release",release.filename));assert.ok(calls[0].includes("--provenance"));
});
test("retry accepts matching published artifacts without another registry write",async()=>{
 const run=async()=>assert.fail("must not republish");
 assert.equal(await publishArtifact(release,"/release",{run,readState:async()=>({published:true,tagged:true})}),"already-published");
 await assert.rejects(publishArtifact(release,"/release",{run,readState:async()=>({published:true,tagged:false})}),/different dist-tag/);
});
