const express = require('express');
const app = express();
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcrypt');
const session = require('express-session');
const fs = require('fs');

mongoose.connect('mongodb+srv://sankalpjha:123_wsankalp@cluster0.ys1kt.mongodb.net/studentapp?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(()=>{
  console.log("db connected")
});

// Set up view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

// User Model
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  course: { type: String, required: true },
  shift: { type: String, required: true },
  semester: { type: String, required: true },
  class: { type: String, required: true },
  role:{ type: String, required: true }
});

const User = mongoose.model('User', userSchema);

// Paper Model
const paperSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  course: { type: String, required: true },
  shift: { type: String, required: true },
  semester: { type: String, required: true },
  class: { type: String, required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  file: { type: String, required: true },
  type: { type: String, required: true, enum: ['paper', 'assignment'] }
});
paperSchema.index({ title: 'text', description: 'text' });
const Paper = mongoose.model('Paper', paperSchema);

// Event Model
const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  date: { type: Date, required: true }
});

const Event = mongoose.model('Event', eventSchema);

// File upload configuration
const upload = multer({ dest: 'uploads/' });

// Routes
app.get('/', (req, res) => {
  res.render('home', { user: req.session.user, notifications: req.session.notifications || [] });
});

app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', async (req, res) => {
  const { name, email, password, course, shift, semester, class: classRoom } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const user = new User({ name, email, password: hashedPassword, course, shift, semester, class: classRoom, role: 'user' });
    await user.save();
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.redirect('/register');
  }
});
app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.redirect('/login');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.redirect('/login');
    }

    // Store user information in the session
    req.session.user = {
      _id: user._id,
      name: user.name,
      email: user.email,
      course: user.course,
      shift: user.shift,
      semester: user.semester,
      class: user.class,
      role: user.role||"user" // Set the default role to 'user'
    };

    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.redirect('/login');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.get('/papers', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1; // Get the current page number
    const limit = 12; // Number of papers per page
      const totalPapers = await Paper.countDocuments({});
      const totalPages = Math.ceil(totalPapers / limit);
      const papers = await Paper.find({})
        .populate("uploadedBy")
        .skip((page - 1) * limit)
        .limit(limit);
  
      res.render('papers', {
        papers,
        user: req.session.user,
        notifications: req.session.notifications || [],
        currentPage: page,
        totalPages,
      });
  
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});
// Add a new route for viewing paper content
app.get('/papers/:id/view', async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.id);

    if (!paper) {
      return res.redirect('/papers');
    }

    res.render('view-paper', { paper, user: req.session.user, notifications: req.session.notifications || []});
  } catch (err) {
    console.error(err);
    res.redirect('/papers');
  }
});

app.get('/search', async (req, res) => {
  const page = parseInt(req.query.page) || 1; // Get the current page number
  const limit = 12; // Number of papers per page
    const totalPapers = await Paper.countDocuments({});
    const totalPages = Math.ceil(totalPapers / limit);
  const searchText = req.query.search || '';
  const searchRegex = new RegExp(searchText, 'i'); // Case-insensitive search

  try {
    const papers = await Paper.find({
      $or: [
        { title: searchRegex },
        { description: searchRegex },
        { 'uploadedBy.name': searchRegex },
        { type: searchRegex },
        { course: searchRegex }
      ],
    }).skip((page - 1) * limit)
    .limit(limit);;

    res.render('papers', { papers, searchText ,user:req.session.user,        currentPage: page,
      totalPages});
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

app.get('/upload', (req, res) => {
  res.render('upload', { user: req.session.user, notifications: req.session.notifications || [] });
});

app.post('/upload', upload.single('file'), async (req, res) => {
  const { title, description, course, shift, semester, class: classRoom, type } = req.body;
  const uploadedBy = req.session.user._id;
  const file = req.file.path;

  try {
    const paper = new Paper({ title, description, course, shift, semester, class: classRoom, uploadedBy, file, type });
    await paper.save();
    req.session.notifications = req.session.notifications || [];
    req.session.notifications.push({ message: `${type} uploaded successfully` });
    res.redirect('/papers');
  } catch (err) {
    console.error(err);
    res.redirect('/upload');
  }
});

app.get('/papers/:paperId/download', async (req, res) => {
  try {
    const paper = await Paper.findById(req.params.paperId);

    // Check if the paper exists
    if (!paper) {
      return res.status(404).send('Paper not found');
    }

    // Get the file path from the paper object
    const filePath = paper.file;

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }

    // Determine the MIME type based on the file extension
  

    // Set headers to force download
    res.setHeader('Content-disposition', `attachment; filename="${path.basename(filePath)}"`);
    res.setHeader('Content-type',"application/pdf");

    // Create a read stream from the file and pipe it to the response
    // const fileStream = fs.createReadStream(filePath);
    // fileStream.pipe(res);
    res.download(paper.file, `${paper.title}.pdf`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

app.get('/admin', async (req, res) => {
  try {
    const users = await User.find();
    const papers = await Paper.find();
    res.render('admin', { users, papers, user: req.session.user, notifications: req.session.notifications || [] });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

app.post('/admin/delete-user', async (req, res) => {
  const userId = req.body.userId;

  try {
    await User.findByIdAndDelete(userId);
    await Paper.deleteMany({ uploadedBy: userId });
    req.session.notifications = req.session.notifications || [];
    req.session.notifications.push({ message: 'User and associated papers deleted successfully' });
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.redirect('/admin');
  }
});
app.post('/clear-notifications', (req, res) => {
  req.session.notifications = []; // Clear the notifications array
  res.redirect('/'); // Redirect back to the home page
});

app.post('/admin/delete-paper', async (req, res) => {
  const paperId = req.body.paperId;

  try {
    await Paper.findByIdAndDelete(paperId);
    req.session.notifications = req.session.notifications || [];
    req.session.notifications.push({ message: 'Paper deleted successfully' });
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.redirect('/admin');
  }
});

app.get('/events', async (req, res) => {
  try {
    const events = await Event.find();
    res.render('events', { events, user: req.session.user, notifications: req.session.notifications || [] });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

app.get('/create-event', (req, res) => {
  res.render('create-event', { user: req.session.user, notifications: req.session.notifications || [] });
});

app.post('/create-event', async (req, res) => {
  const { title, description, date } = req.body;

  try {
    const event = new Event({ title, description, date });
    await event.save();
    req.session.notifications = req.session.notifications || [];
    req.session.notifications.push({ message: 'Event created successfully' });
    res.redirect('/events');
  } catch (err) {
    console.error(err);
    res.redirect('/create-event');
  }
});

// Start the server
app.listen(3000, () => {
  console.log('Server started on port 3000');
});