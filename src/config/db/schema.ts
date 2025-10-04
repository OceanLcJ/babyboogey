import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const config = pgTable("config", {
  name: text("name").unique().notNull(),
  value: text("value"),
});

export const taxonomy = pgTable("taxonomy", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  parentId: text("parent_id"),
  slug: text("slug").unique().notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  image: text("image"),
  icon: text("icon"),
  status: text("status").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  deletedAt: timestamp("deleted_at"),
  sort: integer("sort").default(0).notNull(),
});

export const post = pgTable("post", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  parentId: text("parent_id"),
  slug: text("slug").unique().notNull(),
  type: text("type").notNull(),
  title: text("title"),
  description: text("description"),
  image: text("image"),
  content: text("content"),
  categories: text("categories"),
  tags: text("tags"),
  authorName: text("author_name"),
  authorImage: text("author_image"),
  status: text("status").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  deletedAt: timestamp("deleted_at"),
  sort: integer("sort").default(0).notNull(),
});

export const order = pgTable("order", {
  id: text("id").primaryKey(),
  orderNo: text("order_no").unique().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  userEmail: text("user_email"), // checkout user email
  status: text("status").notNull(), // created, paid, failed
  amount: integer("amount").notNull(), // checkout amount in cents
  currency: text("currency").notNull(), // checkout currency
  productId: text("product_id"),
  paymentType: text("payment_type"), // one_time, subscription
  paymentInterval: text("payment_interval"), // day, week, month, year
  paymentProvider: text("payment_provider").notNull(),
  paymentSessionId: text("payment_session_id"),
  checkoutInfo: text("checkout_info").notNull(), // checkout request info
  checkoutResult: text("checkout_result"), // checkout result
  paymentResult: text("payment_result"), // payment result
  discountCode: text("discount_code"), // discount code
  discountAmount: integer("discount_amount"), // discount amount in cents
  discountCurrency: text("discount_currency"), // discount currency
  paymentEmail: text("payment_email"), // actual payment email
  paymentAmount: integer("payment_amount"), // actual payment amount
  paymentCurrency: text("payment_currency"), // actual payment currency
  paidAt: timestamp("paid_at"), // paid at
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  deletedAt: timestamp("deleted_at"),
  description: text("description"), // order description
  productName: text("product_name"), // product name
  subscriptionId: text("subscription_id"), // subscription id
  subscriptionResult: text("subscription_result"), // subscription result
  checkoutUrl: text("checkout_url"), // checkout url
  callbackUrl: text("callback_url"), // callback url, after handle callback
  creditsAmount: integer("credits_amount"), // credits amount
  creditsValidDays: integer("credits_valid_days"), // credits validity days
});

export const subscription = pgTable("subscription", {
  id: text("id").primaryKey(),
  subscriptionNo: text("subscription_no").unique().notNull(), // subscription no
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  userEmail: text("user_email"), // subscription user email
  status: text("status").notNull(), // subscription status
  paymentProvider: text("payment_provider").notNull(),
  subscriptionId: text("subscription_id").notNull(), // provider subscription id
  subscriptionResult: text("subscription_result"), // provider subscription result
  productId: text("product_id"), // product id
  description: text("description"), // subscription description
  amount: integer("amount"), // subscription amount
  currency: text("currency"), // subscription currency
  interval: text("interval"), // subscription interval, day, week, month, year
  intervalCount: integer("interval_count"), // subscription interval count
  trialPeriodDays: integer("trial_period_days"), // subscription trial period days
  currentPeriodStart: timestamp("current_period_start"), // subscription current period start
  currentPeriodEnd: timestamp("current_period_end"), // subscription current period end
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  deletedAt: timestamp("deleted_at"),
});

export const credit = pgTable("credit", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }), // user id
  userEmail: text("user_email"), // user email
  orderNo: text("order_no"), // payment order no
  subscriptionId: text("subscription_id"), // payment subscription id
  transactionNo: text("transaction_no").unique().notNull(), // transaction no
  transactionType: text("transaction_type").notNull(), // transaction type, grant / consume
  transactionScene: text("transaction_scene"), // transaction scene, payment / subscription / gift / award
  credits: integer("credits").notNull(), // credits amount, n or -n
  remainingCredits: integer("remaining_credits").notNull().default(0), // remaining credits amount
  description: text("description"), // transaction description
  expiresAt: timestamp("expires_at"), // transaction expires at
  status: text("status").notNull(), // transaction status
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  deletedAt: timestamp("deleted_at"),
  consumedDetail: text("consumed_detail"), // consumed detail
});

export const apikey = pgTable("apikey", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  deletedAt: timestamp("deleted_at"),
});
