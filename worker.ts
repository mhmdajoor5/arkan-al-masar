import handler from 'vinext/server/fetch-handler';
import {postMonthlyLedger} from './lib/monthly-ledger-core';

export default {
 fetch:handler.fetch,
 async scheduled(_event:ScheduledController,env:{DB:D1Database}){
  try{await postMonthlyLedger(env.DB)}
  catch(error){console.error('Monthly ledger scheduler failed',error);throw error}
 }
};
