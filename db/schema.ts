import {sqliteTable,text,integer,primaryKey} from 'drizzle-orm/sqlite-core';
export const accounts=sqliteTable('coaching_accounts',{userId:text('user_id').primaryKey(),revision:integer('revision').notNull(),body:text('body').notNull()});
export const requests=sqliteTable('coaching_requests',{userId:text('user_id').notNull(),requestKey:text('request_key').notNull(),digest:text('digest').notNull(),response:text('response').notNull()},t=>[primaryKey({columns:[t.userId,t.requestKey]})]);
