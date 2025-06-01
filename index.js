// index.js
const express       = require('express');
const path          = require('path');
const mongoose      = require('mongoose');
const session       = require('express-session');

const app = express();
const PORT = 3000;

// 1. Connect to MongoDB Atlas (same as before)
const atlasUri = 'mongodb+srv://123abc:123abc@cluster0.vkddpte.mongodb.net/auth_demo?retryWrites=true&w=majority';
mongoose
  .connect(atlasUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// 2. Set up EJS, static files, body parser (same as before)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// 3. Add express-session middleware
app.use(
  session({
    secret: 'some-random-secret-string', 
    resave: false,
    saveUninitialized: false,
    // cookie: { secure: true } → only for HTTPS in production
  })
);

// 4. Import routers
const homeRouter = require('./routes/home');
const authRouter = require('./routes/auth');
const roleRouter = require('./routes/role');

// 5. Mount routers
app.use('/', homeRouter);
app.use('/', authRouter);
app.use('/', roleRouter);

// 6. 404 handler
app.use((req, res) => {
  res.status(404).send('404: Page not found');
});

// 7. Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
