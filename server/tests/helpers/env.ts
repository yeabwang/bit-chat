// imported first by tests that pull in modules reading Env at load time
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/named-chat-test";
process.env.JWT_SECRET ??= "test-secret";
