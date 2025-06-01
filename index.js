// index.js

const express   = require('express');
const path      = require('path');
const mongoose  = require('mongoose');
const session   = require('express-session');

const app = express();

// 1. Read MongoDB connection string and server port from environment variables
const atlasUri = process.env.MONGO_URI;
if (!atlasUri) {
  console.error('❌ Error: MONGO_URI environment variable not set');
  process.exit(1);
}
const PORT = process.env.PORT || 3000;

// 2. Connect to MongoDB Atlas
mongoose
  .connect(atlasUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// 3. Configure EJS, static files, and body parser
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// 4. Configure express-session middleware
app.use(
  session({
    secret: 'some-random-secret-string', 
    resave: false,
    saveUninitialized: false,
    // cookie: { secure: true } → enable in production over HTTPS
  })
);

// 5. Import routers
const homeRouter = require('./routes/home');
const authRouter = require('./routes/auth');
const roleRouter = require('./routes/role');

// 6. Mount routers
app.use('/', homeRouter);
app.use('/', authRouter);
app.use('/', roleRouter);

// 7. 404 handler
app.use((req, res) => {
  res.status(404).send('404: Page not found');
});

// 8. Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
