import { DataInGame } from '../../data/loadDataInGame';
import { CmdID } from '../../proto/cmdId';
import { onReplaceLineupCsReq, onChangeLineupLeaderCsReq, onSetLineupNameCsReq,
 onGetAllLineupDataCsReq, onJoinLineupCsReq, onQuitLineupCsReq, onSwitchLineupIndexCsReq,
 onSwapLineupCsReq } from './lineup';
import { createLineup, selectedAvatarIds } from '../manager/lineup_mgr';
import { starrail } from '../../proto/starrail';
function context() {
 const saved=DataInGame.fromJson({lineups:{0:1001,1:1002}}), sent:any[]=[];
 const session:any={lineups:{},data:{getDataInGame:()=>saved,getIdM7:()=>1001,getIdMain:()=>8001,getDataJson:()=>({avatarIds:()=>[1001,1002,1003,1004]}),saveDataInGame:jest.fn(async()=>{})},sendRsp:async(cmd:number,body:any)=>{sent.push({cmd,body});},sendMessage:async(cmd:number,body:any)=>{sent.push({cmd,body});}};
 return {saved,sent,session};
}
describe('persistent lineup editing',()=>{
 it('preserves explicit sparse slots instead of request ordering',async()=>{
  const {session,saved}=context();await onReplaceLineupCsReq({index:0,leaderSlot:3,lineupSlotList:[{slot:3,id:1003},{slot:1,id:1001}]},session);
  expect(saved.lineupEntries()).toEqual([[1,1001],[3,1003]]);
  expect(createLineup(session).avatarList.map((a:any)=>[a.slot,a.id])).toEqual([[1,1001],[3,1003]]);
 });
 it('rejects duplicate/unknown/empty/out-of-range replacement atomically',async()=>{
  for(const list of [[],[{slot:0,id:1001},{slot:1,id:1001}],[{slot:0,id:999999}],[{slot:4,id:1001}]]) {
   const {session,saved,sent}=context(),before=JSON.stringify(saved.toJson());
   await onReplaceLineupCsReq({index:0,lineupSlotList:list},session);
   expect(sent[sent.length-1].body.retcode).not.toBe(0);expect(JSON.stringify(saved.toJson())).toBe(before);expect(session.data.saveDataInGame).not.toHaveBeenCalled();
  }
 });
 it('persists leader through serialization and rejects an empty leader slot',async()=>{
  const {session,saved,sent}=context();await onChangeLineupLeaderCsReq({slot:1},session);
  const restored=DataInGame.fromJson(saved.toJson());session.data.getDataInGame=()=>restored;
  expect(createLineup(session).leaderSlot).toBe(1);
  await onChangeLineupLeaderCsReq({slot:3},session);expect(sent[sent.length-1].body.retcode).not.toBe(0);expect(createLineup(session).leaderSlot).toBe(1);
 });
 it('edits another team without changing active battle slots, then restores the selected team',async()=>{
  const {session,saved}=context();
  const request=starrail.ReplaceLineupCsReq.decode(starrail.ReplaceLineupCsReq.encode(
   starrail.ReplaceLineupCsReq.fromObject({index:2,leaderSlot:3,lineupSlotList:[{slot:3,id:1003},{slot:1,id:1004}]})).finish());
  await onReplaceLineupCsReq(request,session);
  expect(selectedAvatarIds(session,4)).toEqual([1001,1002,0,0]);
  await onSetLineupNameCsReq({index:2,name:'Second'},session);
  await onSwitchLineupIndexCsReq({index:2},session);
  expect(selectedAvatarIds(session,4)).toEqual([0,1004,0,1003]);
  const restored=DataInGame.fromJson(saved.toJson());session.data.getDataInGame=()=>restored;session.lineups={};
  expect(createLineup(session)).toMatchObject({index:2,name:'Second',leaderSlot:3});
  expect(session.lineups[0]).toEqual([0,1004,0,1003]);
  expect(restored.team(0).slots).toEqual({'0':1001,'1':1002});
 });
 it('serializes all teams with native reply fields and rejects duplicate names',async()=>{
  const {session,saved,sent}=context();
  await onSetLineupNameCsReq({index:0,name:'Main'},session);
  await onReplaceLineupCsReq({index:1,lineupSlotList:[{slot:0,id:1003}]},session);
  await onSetLineupNameCsReq({index:1,name:'Main'},session);
  expect(sent[sent.length-1].body.retcode).not.toBe(0);
  await onGetAllLineupDataCsReq({},session);
  const reply=starrail.GetAllLineupDataScRsp.decode(starrail.GetAllLineupDataScRsp.encode(
   starrail.GetAllLineupDataScRsp.fromObject(sent[sent.length-1].body)).finish());
  expect(reply.curIndex).toBe(0);expect(reply.lineupList.map((v:any)=>v.index)).toEqual([0,1]);
  expect(reply.lineupList[0].name).toBe('Main');expect(saved.lineups).toEqual({'0':1001,'1':1002});
 });
 it('supports join and quit while keeping at least one owned member and a valid leader',async()=>{
  const {session,saved,sent}=context();
  await onJoinLineupCsReq({index:0,slot:3,baseAvatarId:1003,avatarType:3},session);
  await onChangeLineupLeaderCsReq({slot:3},session);
  await onQuitLineupCsReq({index:0,baseAvatarId:1003},session);
  expect(createLineup(session).leaderSlot).toBe(0);
  await onQuitLineupCsReq({index:0,baseAvatarId:1002},session);
  await onQuitLineupCsReq({index:0,baseAvatarId:1001},session);
  expect(sent[sent.length-1].body.retcode).not.toBe(0);expect(saved.lineupEntries()).toEqual([[0,1001]]);
  await onSwitchLineupIndexCsReq({index:9},session);
  expect(sent[sent.length-1].body.retcode).not.toBe(0);expect(saved.currentLineupIndex).toBe(0);
 });
 it('swaps two member slots through the native 726 request and persists the exchange',async()=>{
  const {session,saved,sent}=context();
  const request=starrail.SwapLineupCsReq.decode(starrail.SwapLineupCsReq.encode(
   starrail.SwapLineupCsReq.fromObject({planeId:3,index:0,ENBIBCPPLDC:0,MPIEGFCNBEN:1})).finish());
  await onSwapLineupCsReq(request,session);
  expect(sent[sent.length-1].cmd).toBe(CmdID.CmdSwapLineupScRsp);
  expect(sent[sent.length-1].body.retcode).toBe(0);
  expect(saved.lineupEntries()).toEqual([[0,1002],[1,1001]]);
  expect(sent.filter((s:any)=>s.cmd===CmdID.CmdSyncLineupNotify).length).toBe(1);
  const ids=createLineup(session).avatarList.map((a:any)=>[a.slot,a.id]);
  expect(ids).toEqual([[0,1002],[1,1001]]);
  const restored=DataInGame.fromJson(saved.toJson());session.data.getDataInGame=()=>restored;session.lineups={};
  expect(restored.team(0).slots).toEqual({'0':1002,'1':1001});
  expect(createLineup(session).avatarList.map((a:any)=>[a.slot,a.id])).toEqual([[0,1002],[1,1001]]);
 });
 it('rejects same-slot, unknown-slot and virtual swaps atomically',async()=>{
  for(const [req,code] of [
   [{index:0,ENBIBCPPLDC:1,MPIEGFCNBEN:1},1410],
   [{index:0,ENBIBCPPLDC:0,MPIEGFCNBEN:9},1402],
   [{index:0,ENBIBCPPLDC:0,MPIEGFCNBEN:1,isVirtual:true},1418]] as [any,number][]) {
   const {session,saved,sent}=context(),before=JSON.stringify(saved.toJson());
   await onSwapLineupCsReq(req,session);
   expect(sent[sent.length-1].body.retcode).toBe(code);
   expect(JSON.stringify(saved.toJson())).toBe(before);
   expect(session.data.saveDataInGame).not.toHaveBeenCalled();
  }
 });
});


