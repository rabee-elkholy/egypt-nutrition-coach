import {sqliteTable,text,integer,primaryKey} from 'drizzle-orm/sqlite-core';
export const accounts=sqliteTable('coaching_accounts',{userId:text('user_id').primaryKey(),revision:integer('revision').notNull(),body:text('body').notNull()});
export const requests=sqliteTable('coaching_requests',{userId:text('user_id').notNull(),requestKey:text('request_key').notNull(),digest:text('digest').notNull(),response:text('response').notNull()},t=>[primaryKey({columns:[t.userId,t.requestKey]})]);
export const plans=sqliteTable('coaching_plans',{userId:text('user_id').notNull(),planId:text('plan_id').notNull(),createdAt:text('created_at').notNull(),body:text('body').notNull()},t=>[primaryKey({columns:[t.userId,t.planId]})]);
export const changes=sqliteTable('coaching_changes',{userId:text('user_id').notNull(),revision:integer('revision').notNull(),action:text('action').notNull(),at:text('at').notNull()},t=>[primaryKey({columns:[t.userId,t.revision]})]);
export const workoutPlans=sqliteTable('coaching_workout_plans',{userId:text('user_id').notNull(),planId:text('plan_id').notNull(),body:text('body').notNull()},t=>[primaryKey({columns:[t.userId,t.planId]})]);
