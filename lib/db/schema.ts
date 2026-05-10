import { relations, sql } from 'drizzle-orm';
import { boolean, check, date, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const accountTypeEnum = pgEnum('account_type', [
  'operativa',
  'fondo',
  'inversion',
  'deuda',
  'por_cobrar',
  'operational_cash',
  'savings_fund',
  'investment',
  'credit_card',
  'loan',
  'receivable'
]);

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  fullName: text('full_name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const households = pgTable('households', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const householdMembers = pgTable('household_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').references(() => households.id).notNull(),
  profileId: uuid('profile_id').references(() => profiles.id).notNull(),
  role: text('role').notNull().default('member')
});

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').references(() => households.id).notNull(),
  name: text('name').notNull(),
  type: accountTypeEnum('type').notNull(),
  balance: numeric('balance', { precision: 14, scale: 2 }).notNull().default('0'),
  periodicPayment: numeric('periodic_payment', { precision: 14, scale: 2 }),
  paymentDay: integer('payment_day'),
  counterparty: text('counterparty'),
  displayOrder: integer('display_order'),
  isActive: boolean('is_active').notNull().default(true)
});

export const incomeSources = pgTable('income_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').references(() => households.id).notNull(),
  name: text('name').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  recurring: boolean('recurring').notNull().default(true)
});

export const obligations = pgTable('obligations', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').references(() => households.id).notNull(),
  name: text('name').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  dueDay: integer('due_day')
});

export const variableSpendingProfiles = pgTable('variable_spending_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').references(() => households.id).notNull(),
  category: text('category').notNull(),
  monthlyEstimate: numeric('monthly_estimate', { precision: 14, scale: 2 }).notNull()
});

export const transactionGroups = pgTable('transaction_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').references(() => households.id).notNull(),
  source: text('source').notNull().default('manual'),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').references(() => transactionGroups.id).notNull(),
  accountId: uuid('account_id').references(() => accounts.id),
  type: text('type').notNull(),
  category: text('category').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  happenedAt: timestamp('happened_at').defaultNow().notNull()
});

export const receivables = pgTable('receivables', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').references(() => households.id).notNull(),
  counterparty: text('counterparty').notNull(),
  originalAmount: numeric('original_amount', { precision: 14, scale: 2 }).notNull(),
  pendingAmount: numeric('pending_amount', { precision: 14, scale: 2 }).notNull(),
  status: text('status').notNull().default('activo')
});

export const msiPurchases = pgTable('msi_purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').references(() => households.id).notNull(),
  accountId: uuid('account_id').references(() => accounts.id).notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
  months: integer('months').notNull(),
  monthlyAmount: numeric('monthly_amount', { precision: 14, scale: 2 }).notNull(),
  purchaseDate: timestamp('purchase_date').defaultNow().notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  totalAmountPositiveCheck: check('msi_purchases_total_amount_check', sql`${table.totalAmount} > 0`),
  monthsCheck: check('msi_purchases_months_check', sql`${table.months} > 1`),
  monthlyAmountPositiveCheck: check('msi_purchases_monthly_amount_check', sql`${table.monthlyAmount} > 0`),
  statusCheck: check('msi_purchases_status_check', sql`${table.status} IN ('active', 'completed', 'cancelled')`)
}));

export const msiInstallments = pgTable('msi_installments', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').references(() => households.id).notNull(),
  msiPurchaseId: uuid('msi_purchase_id').references(() => msiPurchases.id).notNull(),
  installmentNumber: integer('installment_number').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  dueDate: date('due_date'),
  status: text('status').notNull().default('pending'),
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  installmentNumberPositiveCheck: check('msi_installments_installment_number_check', sql`${table.installmentNumber} > 0`),
  amountPositiveCheck: check('msi_installments_amount_check', sql`${table.amount} > 0`),
  statusCheck: check('msi_installments_status_check', sql`${table.status} IN ('pending', 'paid')`)
}));


export const extraWorkEntries = pgTable('extra_work_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').references(() => households.id).notNull(),
  workDate: date('work_date').notNull(),
  type: text('type').notNull(),
  quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull(),
  status: text('status').notNull().default('pending'),
  paidAt: timestamp('paid_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  typeCheck: check('extra_work_entries_type_check', sql`${table.type} IN ('overtime', 'piecework', 'meals')`),
  quantityPositiveCheck: check('extra_work_entries_quantity_check', sql`${table.quantity} > 0`),
  statusCheck: check('extra_work_entries_status_check', sql`${table.status} IN ('pending', 'paid')`)
}));


export const financialClosures = pgTable('financial_closures', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').references(() => households.id).notNull(),
  type: text('type').notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  openingTotal: numeric('opening_total', { precision: 14, scale: 2 }).notNull(),
  closingTotal: numeric('closing_total', { precision: 14, scale: 2 }).notNull(),
  netChange: numeric('net_change', { precision: 14, scale: 2 }).notNull(),
  incomeTotal: numeric('income_total', { precision: 14, scale: 2 }).notNull(),
  expenseTotal: numeric('expense_total', { precision: 14, scale: 2 }).notNull(),
  netFlow: numeric('net_flow', { precision: 14, scale: 2 }).notNull(),
  accountSnapshots: jsonb('account_snapshots').notNull(),
  movementSummary: jsonb('movement_summary'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  typeCheck: check('financial_closures_type_check', sql`${table.type} IN ('weekly', 'monthly')`),
  periodRangeCheck: check('financial_closures_period_range_check', sql`${table.periodStart} <= ${table.periodEnd}`)
}));

export const financialSnapshots = pgTable('financial_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').references(() => households.id).notNull(),
  periodType: text('period_type').notNull(),
  payload: text('payload').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const diagnoses = pgTable('diagnoses', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').references(() => households.id).notNull(),
  title: text('title').notNull(),
  detail: text('detail').notNull(),
  priority: integer('priority').notNull().default(1)
});

export const recommendations = pgTable('recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').references(() => households.id).notNull(),
  message: text('message').notNull()
});

export const simulations = pgTable('simulations', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').references(() => households.id).notNull(),
  scenario: text('scenario').notNull(),
  result: text('result').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const recurringPatterns = pgTable('recurring_patterns', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').references(() => households.id).notNull(),
  patternType: text('pattern_type').notNull(),
  active: boolean('active').notNull().default(false)
});

export const calendarEvents = pgTable('calendar_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').references(() => households.id).notNull(),
  label: text('label').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  eventDate: timestamp('event_date').notNull()
});

export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').references(() => households.id).notNull(),
  accountId: uuid('account_id').references(() => accounts.id),
  name: text('name').notNull(),
  targetAmount: numeric('target_amount', { precision: 14, scale: 2 }).notNull(),
  savedAmount: numeric('saved_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  targetDate: timestamp('target_date').notNull()
});

export const householdRelations = relations(households, ({ many }) => ({
  members: many(householdMembers),
  accounts: many(accounts)
}));
