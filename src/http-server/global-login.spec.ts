import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpServerController } from './http-server.controller';
import { HttpServerService } from './http-server.service';
import { HotfixService } from '../data/hotfix.service';

describe('4.7.51 overseas password login', () => {
 it.each([
  '/hkrpg_global/account/ma-passport/api/appLoginByPassword',
  '/hkrpg_global/account/ma-passport/token/verifySToken?lrsag=1',
 ])('returns the configured local identity over SDK route %s', async (route) => {
  const module = await Test.createTestingModule({controllers:[HttpServerController],providers:[HttpServerService,{provide:HotfixService,useValue:{}}]}).compile();
  const app=module.createNestApplication(); await app.init();
  try {
   const result=await request(app.getHttpServer()).post(route).send({account:'encrypted-test',password:'encrypted-test'}).expect(200);
   const configured=new HttpServerService({} as any).passportLoginService();
   expect(result.body.data.token).toEqual({token:configured.data.token.token,token_type:1});
   expect(result.body.data.user_info.aid).toBe(configured.data.user_info.aid);
   expect(result.body.data.user_info.mid).toBe(configured.data.user_info.mid);
   expect(result.body.data.user_info.token).toBe(configured.data.token.token);
   expect(result.body.data.ext_user_info).toEqual({birth:'0',guardian_email:''});
  } finally {await app.close();}
 });
});
