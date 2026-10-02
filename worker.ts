import handler from 'vinext/server/fetch-handler';
import {postMonthlyLedger} from './lib/monthly-ledger-core';

export default {
 fetch:handler.fetch,
 async scheduled(_event:ScheduledController,env:{DB:D1Database}){
  await postMonthlyLedger(env.DB);
 }
};
