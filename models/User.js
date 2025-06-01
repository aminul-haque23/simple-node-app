// models/User.js
const mongoose = require('mongoose');

// Define the schema for a User
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['student', 'teacher', 'admin'],
    required: true
  }
});

// Export the model so we can use it elsewhere
module.exports = mongoose.model('User', userSchema);
