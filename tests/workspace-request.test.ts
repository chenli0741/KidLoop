import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workspaceRequestAllowed} from '../src/lib/workspace-request';
test('login redirect renders without a mutation header; all mutations require the exact rendered session',()=>{
 assert.equal(workspaceRequestAllowed('new-session',null,false),true);
 assert.equal(workspaceRequestAllowed('new-session','new-session',false),true);
 assert.equal(workspaceRequestAllowed('new-session','new-session',true),true);
 assert.equal(workspaceRequestAllowed('new-session',null,true),false);
 assert.equal(workspaceRequestAllowed('new-session','old-session',true),false);
 assert.equal(workspaceRequestAllowed('new-session','old-session',false),false);
 assert.equal(workspaceRequestAllowed('new-session','',true),false);
 assert.equal(workspaceRequestAllowed(undefined,null,false),false);
});
