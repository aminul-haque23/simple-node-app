// routes/role.js
const express = require('express');
const router  = express.Router();

// 1. Middleware: Ensure the user is logged in
function isLoggedIn(req, res, next) {
  if (!req.session || !req.session.username) {
    return res.redirect('/login');
  }
  next();
}

// 2. Middleware factory: Ensure the user has a specific role
function requireRole(role) {
  return function (req, res, next) {
    if (req.session.role !== role) {
      // You can redirect elsewhere or send a 403
      return res.status(403).send('403: Access denied');
    }
    next();
  };
}

// 3. Student-only page (GET /student)
router.get(
  '/student',
  isLoggedIn,
  requireRole('student'),
  (req, res) => {
    // Pass the entire session.user info into the template
    return res.render('student', {
      user: {
        username: req.session.username,
        name: req.session.name,
        role: req.session.role
      }
    });
  }
);

// 4. Teacher-only page (GET /teacher)
router.get(
  '/teacher',
  isLoggedIn,
  requireRole('teacher'),
  (req, res) => {
    return res.render('teacher', {
      user: {
        username: req.session.username,
        name: req.session.name,
        role: req.session.role
      }
    });
  }
);

 // 5. Profile page (GET /profile) – ANY logged-in role may view
router.get(
   '/profile',
   isLoggedIn,
   (req, res) => {
     return res.render('profile', {
       user: {
         username: req.session.username,
         name: req.session.name,
         role: req.session.role
       }
     });
   }
);

router.get(
  '/admin',
  isLoggedIn,
  requireRole('admin'),
  (req,res) =>{
    return res.render('admin', {
      user: {
        username: req.session.username,
        name: req.session.name,
        role: req.session.role
    }
    });
  }
);

module.exports = router;
