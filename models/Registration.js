// models/Registration.js
const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  registeredAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure a student cannot register for the same course twice:
registrationSchema.index({ student: 1, course: 1 }, { unique: true });

module.exports = mongoose.model('Registration', registrationSchema);
