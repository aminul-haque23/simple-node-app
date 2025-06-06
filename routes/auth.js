// routes/auth.js
const express = require('express');
const router  = express.Router();
const User    = require('../models/User');

const TEACHER_CODE = '12345';
const ADMIN_CODE = '54321';

// GET "/login" → render login.ejs
router.get('/login', (req, res) => {
  // If already logged in, redirect to home
  if (req.session.username) {
    return res.redirect('/');
  }
  res.render('login');
});

// POST "/login" → handle login form submission
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username, password });
    if (!user) {
      return res.render('login', {errorMsg: 'Invalid username or password. Try again.'});

    }

    // 1. Store username in session
    req.session.username = user.username;
    req.session.name = user.name; // you can store multiple fields if you like
    req.session.role = user.role;
    req.session.userId = user._id;

    console.log('🟢 User role after login:', req.session.role);
    console.log('🟢 User id after login:', req.session.userId);

    if(user.role == 'student'){
      return res.redirect('/student');
    }
    else if(user.role == 'teacher'){
      return res.redirect('/teacher');
    }

    // 2. Redirect to home
    return res.redirect('/');
  } catch (err) {
    console.error('❌ Login error:', err);
    return res.status(500).send('Server error');
  }
});

// GET "/signup" → render signup.ejs
router.get('/signup', (req, res) => {
  // If already logged in, redirect to home
  if (req.session.username) {
    return res.redirect('/');
  }
  res.render('signup');
});

// POST "/signup" → handle signup form submission
router.post('/signup', async (req, res) => {
  const { idNumber, name, username, password, address, phone, role, secretCode } = req.body;

  console.log("Secret code:", secretCode);
  console.log("Type of secret code: ", typeof(secretCode));

  if (role === 'teacher' && secretCode !== TEACHER_CODE) {
    return res.render('signup', { errorMsg: 'Invalid teacher signup code.' });
  }
  if (role === 'admin' && secretCode !== ADMIN_CODE) {
    return res.render('signup', { errorMsg: 'Invalid admin signup code.' });
  }

  try {
    const newUser = new User({ idNumber, name, username, password, role, address, phone });
    await newUser.save();
    console.log('✅ User created:', username, '– role:', role);

    // Automatically log them in (optional) or redirect to login
    // Let’s redirect to /login so they can type credentials:
    return res.redirect('/login');
  }
   catch (err) {
    console.error('❌ Error creating user:', err);
    // Duplicate key (could be idNumber or username)
    if (err.code === 11000) {
      // Determine which field was duplicated:
      const dupKey = Object.keys(err.keyPattern)[0];
      if (dupKey === 'idNumber') {
        return res.render('signup', { errorMsg: 'ID number already in use.' });
      }
      if (dupKey === 'username') {
        return res.render('signup', { errorMsg: 'Username already taken.' });
      }
    }
    return res.render('signup', { errorMsg: 'Server error. Please try again.' });
  }
});

// GET "/logout" → destroy the session
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('❌ Error destroying session:', err);
      return res.status(500).send('Server error');
    }
    // After logout, redirect to home (non-logged-in)
    res.redirect('/');
  });
});

module.exports = router;
