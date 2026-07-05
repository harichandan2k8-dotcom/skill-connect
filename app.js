const STORAGE_KEY = "skillConnectData";
const APP_VERSION = 3;
const SUPABASE_URL = "https://yccmtddzchewurdrtmdz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_hR-FvDuwSsvWdt_aozYFjQ_r52UZaHC";
const SUPABASE_TABLE = "skill_connect_store";
const SUPABASE_ROW_ID = "main";

const seedData = {
  version: APP_VERSION,
  users: [],
  requests: [],
  sessions: [],
  tasks: [],
  messages: [],
};

let data = structuredClone(seedData);
let currentUser = null;
let authMode = "login";
let activeView = "dashboard";
let selectedContactId = null;
let supabaseClient = null;
let cloudSaveTimer = null;
let storageStatus = "local";

function normalizeData(value) {
  if (!value || value.version !== APP_VERSION) return structuredClone(seedData);
  return {
    ...structuredClone(seedData),
    ...value,
    users: value.users || [],
    requests: value.requests || [],
    sessions: value.sessions || [],
    tasks: value.tasks || [],
    messages: value.messages || [],
  };
}

function loadLocalData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedData));
    return structuredClone(seedData);
  }

  try {
    return normalizeData(JSON.parse(saved));
  } catch (error) {
    console.warn("Local data was damaged and has been reset.", error);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedData));
    return structuredClone(seedData);
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  scheduleCloudSave();
}

function isSupabaseConfigured() {
  return Boolean(
    window.supabase
    && SUPABASE_URL.startsWith("https://")
    && SUPABASE_ANON_KEY
    && !SUPABASE_URL.includes("PASTE_YOUR")
    && !SUPABASE_ANON_KEY.includes("PASTE_YOUR")
  );
}

function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

async function loadCloudData() {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data: row, error } = await client
      .from(SUPABASE_TABLE)
      .select("data")
      .eq("id", SUPABASE_ROW_ID)
      .maybeSingle();

    if (error) throw error;
    storageStatus = "supabase";
    return row?.data ? normalizeData(row.data) : null;
  } catch (error) {
    storageStatus = "local";
    console.warn("Supabase load failed. Using browser storage instead.", error);
    alert("Supabase connection failed. The app is using browser storage for now. Check your Supabase URL, key, table, and policies.");
    return null;
  }
}

function scheduleCloudSave() {
  if (!isSupabaseConfigured()) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => {
    saveCloudData();
  }, 500);
}

async function saveCloudData() {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    const { error } = await client
      .from(SUPABASE_TABLE)
      .upsert({
        id: SUPABASE_ROW_ID,
        data,
        updated_at: new Date().toISOString(),
      });
    if (error) throw error;
    storageStatus = "supabase";
  } catch (error) {
    storageStatus = "local";
    console.warn("Supabase save failed. Browser storage still has the latest data.", error);
  }
}

async function initApp() {
  data = loadLocalData();
  render();

  const cloudData = await loadCloudData();
  if (cloudData) {
    data = cloudData;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    render();
    return;
  }

  if (isSupabaseConfigured()) {
    await saveCloudData();
  }
}

function uid(prefix) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 999)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function splitList(value = "") {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function joinList(value = []) {
  return Array.isArray(value) ? value.join(", ") : value || "";
}

function readImageFile(file, callback) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => callback(reader.result));
  reader.readAsDataURL(file);
}

function getUser(id) {
  return data.users.find((user) => user.id === id);
}

function mentors() {
  return data.users.filter((user) => user.role === "mentor");
}

function students() {
  return data.users.filter((user) => user.role === "student");
}

function currentStudentId() {
  if (currentUser.role === "student") return currentUser.id;
  return data.requests.find((request) => request.mentorId === currentUser.id)?.studentId || students()[0]?.id;
}

function saveCurrentUserUpdates(updates) {
  Object.assign(currentUser, updates);
  if (currentUser.role === "mentor") {
    currentUser.verificationScore = calculateVerificationScore(currentUser);
    currentUser.verificationStatus = currentUser.verificationScore >= 75 ? "Verified" : "Under Review";
  }
  const storedUser = getUser(currentUser.id);
  if (storedUser) Object.assign(storedUser, currentUser);
  saveData();
}

function calculateVerificationScore(mentor) {
  let score = 20;
  if (Number(mentor.experience) >= 1) score += 14;
  if (Number(mentor.experience) >= 3) score += 16;
  if (mentor.organization) score += 12;
  if (mentor.credentials) score += 14;
  if (mentor.courses) score += 12;
  if (mentor.skills.length >= 3) score += 12;
  return Math.min(score, 100);
}

function mentorMatchScore(mentor, student = currentUser) {
  const studentWords = [
    ...(student?.skills || []),
    ...(student?.interests || []),
    student?.goal || "",
    student?.course || "",
    student?.college || "",
  ].join(" ").toLowerCase();
  const mentorWords = [
    ...mentor.skills,
    mentor.title,
    mentor.bio,
    mentor.courses,
  ].join(" ").toLowerCase();

  let score = 35;
  mentor.skills.forEach((skill) => {
    if (studentWords.includes(skill.toLowerCase())) score += 14;
  });
  splitList(student?.goal || "").forEach((goalWord) => {
    if (mentorWords.includes(goalWord.toLowerCase())) score += 4;
  });
  score += Math.min(Number(mentor.experience || 0) * 2, 16);
  score += mentor.verificationStatus === "Verified" ? 10 : 2;
  score += Math.round(Number(mentor.rating || 4) * 2);
  return Math.min(score, 99);
}

function aiRecommendationText(mentor, student = currentUser) {
  const matchingSkills = mentor.skills.filter((skill) => {
    const target = `${student?.skills?.join(" ") || ""} ${student?.interests?.join(" ") || ""} ${student?.goal || ""}`.toLowerCase();
    return target.includes(skill.toLowerCase());
  });
  const skillLine = matchingSkills.length ? matchingSkills.join(", ") : mentor.skills.slice(0, 2).join(", ");
  return `AI match: ${mentor.name} is strong for ${skillLine}. Good fit for ${student?.goal || "skill improvement"} because of ${mentor.experience}+ years at ${mentor.organization}.`;
}

function render() {
  if (!currentUser) {
    renderAuth();
    return;
  }
  renderApp();
}

function renderAuth(message = "") {
  document.getElementById("app").innerHTML = `
    <main class="auth-page">
      <section class="auth-shell glass-panel">
        <div class="brand auth-brand">
          <span class="brand-mark">SC</span>
          <div>
            <h1>Skill Connect</h1>
            <p>AI guided mentor matching for serious learners</p>
          </div>
        </div>
        <div class="auth-tabs">
          <button class="${authMode === "login" ? "active" : ""}" data-auth="login">Login</button>
          <button class="${authMode === "student" ? "active" : ""}" data-auth="student">Student Register</button>
          <button class="${authMode === "mentor" ? "active" : ""}" data-auth="mentor">Mentor Register</button>
        </div>
        ${message ? `<p class="notice error">${esc(message)}</p>` : ""}
        <div id="authFormSlot">${authMode === "login" ? loginForm() : authMode === "student" ? studentForm() : mentorForm()}</div>
      </section>
      <section class="auth-visual">
        <div class="hero-copy">
          <span class="eyebrow">Final Year Project</span>
          <h2>Find the right mentor. Build the right skill path.</h2>
          <p>Students register with college and course details. Mentors register with work, courses, credentials, and experience for verification.</p>
        </div>
        <div class="floating-card metric-card">
          <span>AI Match</span>
          <strong>96%</strong>
          <small>Skill fit + verified experience</small>
        </div>
        <div class="floating-card palette-card">
          <span>#0C0E1D</span>
          <span>#616083</span>
          <span>#FF81FF</span>
          <span>#5IFAAA</span>
        </div>
      </section>
    </main>
  `;

  document.querySelectorAll("[data-auth]").forEach((button) => {
    button.addEventListener("click", () => {
      authMode = button.dataset.auth;
      renderAuth();
    });
  });

  const login = document.getElementById("loginForm");
  if (login) login.addEventListener("submit", handleLogin);

  const studentRegister = document.getElementById("studentRegisterForm");
  if (studentRegister) {
    setupPhotoInputs(studentRegister);
    studentRegister.addEventListener("submit", handleStudentRegister);
  }

  const mentorRegister = document.getElementById("mentorRegisterForm");
  if (mentorRegister) {
    setupPhotoInputs(mentorRegister);
    mentorRegister.addEventListener("submit", handleMentorRegister);
  }
}

function loginForm() {
  return `
    <form class="form" id="loginForm">
      <label>Email<input name="email" type="email" placeholder="Enter your registered email" required /></label>
      <label>Password<input name="password" type="password" placeholder="Enter your password" required /></label>
      <button class="btn primary" type="submit">Login</button>
      <p class="form-note">New here? Create a student or mentor account first.</p>
    </form>
  `;
}

function studentForm() {
  return `
    <form class="form two-col" id="studentRegisterForm">
      ${photoUploadField("Student profile photo")}
      <label>Full name<input name="name" required /></label>
      <label>Email<input name="email" type="email" required /></label>
      <label>Password<input name="password" type="password" minlength="6" required /></label>
      <label>College name<input name="college" placeholder="Your college name" required /></label>
      <label>Course doing<input name="course" placeholder="Diploma CSE, BCA, B.Tech..." required /></label>
      <label>Semester / year<input name="semester" placeholder="5th semester" required /></label>
      <label>Current skills<input name="skills" placeholder="HTML, CSS, Python" required /></label>
      <label>Interested skills<input name="interests" placeholder="Web Development, AI, UI Design" required /></label>
      <label class="wide">Goal<input name="goal" placeholder="Build final year project, get internship, improve coding..." required /></label>
      <button class="btn primary wide" type="submit">Create Student Account</button>
    </form>
  `;
}

function mentorForm() {
  return `
    <form class="form two-col" id="mentorRegisterForm">
      ${photoUploadField("Mentor profile photo")}
      <label>Full name<input name="name" required /></label>
      <label>Email<input name="email" type="email" required /></label>
      <label>Password<input name="password" type="password" minlength="6" required /></label>
      <label>Professional title<input name="title" placeholder="Software Engineer, UI Designer..." required /></label>
      <label>Where do you work?<input name="organization" placeholder="Company, institute, freelancer" required /></label>
      <label>Experience in years<input name="experience" type="number" min="0" max="50" required /></label>
      <label>Courses completed<input name="courses" placeholder="Full Stack, Python, UX Design..." required /></label>
      <label>Expert skills<input name="skills" placeholder="JavaScript, React, Python" required /></label>
      <label>Certificate / LinkedIn / portfolio link<input name="credentials" type="url" placeholder="https://..." required /></label>
      <label>Availability<input name="availability" placeholder="Sat, Sun - 10 AM" required /></label>
      <label class="wide">Professional bio<input name="bio" placeholder="Tell students how you can guide them" required /></label>
      <button class="btn primary wide" type="submit">Submit Mentor Verification</button>
    </form>
  `;
}

function photoUploadField(label) {
  return `
    <fieldset class="photo-field wide">
      <legend>${esc(label)}</legend>
      <div class="photo-picker">
        <div class="photo-preview" data-photo-preview>Photo</div>
        <div class="photo-actions">
          <input name="profilePhoto" type="hidden" />
          <input class="visually-hidden" data-photo-gallery type="file" accept="image/*" />
          <input class="visually-hidden" data-photo-camera type="file" accept="image/*" capture="user" />
          <button class="btn ghost" type="button" data-open-gallery>Choose Gallery</button>
          <button class="btn ghost" type="button" data-open-camera>Use Camera</button>
          <button class="btn ghost" type="button" data-clear-photo>Remove</button>
        </div>
      </div>
    </fieldset>
  `;
}

function setupPhotoInputs(form) {
  const hidden = form.querySelector("input[name='profilePhoto']");
  const preview = form.querySelector("[data-photo-preview]");
  const gallery = form.querySelector("[data-photo-gallery]");
  const camera = form.querySelector("[data-photo-camera]");
  const openGallery = form.querySelector("[data-open-gallery]");
  const openCamera = form.querySelector("[data-open-camera]");
  const clearPhoto = form.querySelector("[data-clear-photo]");

  const updatePreview = (src) => {
    hidden.value = src || "";
    preview.innerHTML = src ? `<img src="${src}" alt="Selected profile photo" />` : "Photo";
    preview.classList.toggle("has-photo", Boolean(src));
  };

  openGallery.addEventListener("click", () => gallery.click());
  openCamera.addEventListener("click", () => camera.click());
  clearPhoto.addEventListener("click", () => updatePreview(""));
  [gallery, camera].forEach((input) => {
    input.addEventListener("change", () => {
      readImageFile(input.files[0], updatePreview);
      input.value = "";
    });
  });
}

function handleLogin(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const email = form.get("email").trim().toLowerCase();
  const password = form.get("password");
  const user = data.users.find((item) => item.email.toLowerCase() === email && item.password === password);
  if (!user) {
    renderAuth("No account found with this email and password.");
    return;
  }
  currentUser = user;
  activeView = "dashboard";
  selectedContactId = null;
  render();
}

function handleStudentRegister(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const email = form.get("email").trim().toLowerCase();
  if (data.users.some((user) => user.email.toLowerCase() === email)) {
    renderAuth("This email is already registered.");
    return;
  }

  const student = {
    id: uid("s"),
    name: form.get("name").trim(),
    email,
    password: form.get("password"),
    role: "student",
    profilePhoto: form.get("profilePhoto"),
    title: form.get("course").trim(),
    college: form.get("college").trim(),
    course: form.get("course").trim(),
    semester: form.get("semester").trim(),
    skills: splitList(form.get("skills")),
    interests: splitList(form.get("interests")),
    goal: form.get("goal").trim(),
  };

  data.users.push(student);
  data.tasks.push(
    { id: uid("t"), studentId: student.id, title: "Complete profile and explore AI mentor matches", done: false },
    { id: uid("t"), studentId: student.id, title: "Send first mentorship request", done: false },
  );
  saveData();
  currentUser = student;
  activeView = "ai";
  render();
}

function handleMentorRegister(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const email = form.get("email").trim().toLowerCase();
  if (data.users.some((user) => user.email.toLowerCase() === email)) {
    renderAuth("This email is already registered.");
    return;
  }

  const mentor = {
    id: uid("m"),
    name: form.get("name").trim(),
    email,
    password: form.get("password"),
    role: "mentor",
    profilePhoto: form.get("profilePhoto"),
    title: form.get("title").trim(),
    organization: form.get("organization").trim(),
    location: "Not added",
    experience: Number(form.get("experience")),
    courses: form.get("courses").trim(),
    skills: splitList(form.get("skills")),
    credentials: form.get("credentials").trim(),
    availability: form.get("availability").trim(),
    bio: form.get("bio").trim(),
    rating: 4.5,
  };
  mentor.verificationScore = calculateVerificationScore(mentor);
  mentor.verificationStatus = mentor.verificationScore >= 75 ? "Verified" : "Under Review";

  data.users.push(mentor);
  saveData();
  currentUser = mentor;
  activeView = "dashboard";
  render();
}

function renderApp() {
  const nav = [
    ["dashboard", "Dashboard"],
    ["ai", "AI Match"],
    ["mentors", currentUser.role === "mentor" ? "My Profile" : "Mentors"],
    ["requests", "Requests"],
    ["sessions", "Sessions"],
    ["progress", "Progress"],
    ["chat", "Chat"],
    ["settings", "Settings"],
  ];

  document.getElementById("app").innerHTML = `
    <div class="shell">
      <aside class="sidebar glass-panel">
        <div class="brand compact">
          <span class="brand-mark">SC</span>
          <div>
            <h1>Skill Connect</h1>
            <p>${currentUser.role === "mentor" ? "Verified mentor workspace" : "Student workspace"}</p>
          </div>
        </div>
        <nav class="nav">
          ${nav.map(([key, label]) => `<button class="${activeView === key ? "active" : ""}" data-view="${key}">${label}</button>`).join("")}
        </nav>
        <div class="profile-card">
          ${avatarHtml(currentUser, "small")}
          <strong>${esc(currentUser.name)}</strong>
          <span>${esc(currentUser.title || currentUser.course || currentUser.role)}</span>
          ${currentUser.role === "mentor" ? `<span class="status ${currentUser.verificationStatus === "Verified" ? "accepted" : "pending"}">${esc(currentUser.verificationStatus)}</span>` : ""}
          <div class="profile-photo-actions">
            <input class="visually-hidden" data-current-photo-gallery type="file" accept="image/*" />
            <input class="visually-hidden" data-current-photo-camera type="file" accept="image/*" capture="user" />
            <button class="btn ghost" type="button" data-current-open-gallery>Gallery</button>
            <button class="btn ghost" type="button" data-current-open-camera>Camera</button>
          </div>
          <button class="btn ghost full" id="logoutBtn">Logout</button>
        </div>
      </aside>
      <main class="content">
        ${viewHeader()}
        <section id="view"></section>
      </main>
    </div>
  `;

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      activeView = button.dataset.view;
      render();
    });
  });
  document.getElementById("logoutBtn").addEventListener("click", () => {
    currentUser = null;
    authMode = "login";
    render();
  });
  setupCurrentUserPhotoControls();

  const views = {
    dashboard: renderDashboard,
    ai: renderAiMatch,
    mentors: renderMentors,
    requests: renderRequests,
    sessions: renderSessions,
    progress: renderProgress,
    chat: renderChat,
    settings: renderSettings,
  };
  views[activeView]();
}

function setupCurrentUserPhotoControls() {
  const gallery = document.querySelector("[data-current-photo-gallery]");
  const camera = document.querySelector("[data-current-photo-camera]");
  const openGallery = document.querySelector("[data-current-open-gallery]");
  const openCamera = document.querySelector("[data-current-open-camera]");

  const savePhoto = (src) => {
    currentUser.profilePhoto = src;
    const storedUser = getUser(currentUser.id);
    if (storedUser) storedUser.profilePhoto = src;
    saveData();
    render();
  };

  openGallery.addEventListener("click", () => gallery.click());
  openCamera.addEventListener("click", () => camera.click());
  [gallery, camera].forEach((input) => {
    input.addEventListener("change", () => {
      readImageFile(input.files[0], savePhoto);
      input.value = "";
    });
  });
}

function profileCompletion(user = currentUser) {
  const baseFields = ["name", "email", "profilePhoto", "coverPhoto", "headline", "location", "phone", "website", "linkedin", "bio"];
  const roleFields = user.role === "mentor"
    ? ["title", "organization", "experience", "courses", "skills", "credentials", "availability", "sessionFee", "responseTime"]
    : ["college", "course", "semester", "skills", "interests", "goal", "targetRole", "learningStyle", "weeklyHours"];
  const fields = [...baseFields, ...roleFields];
  const filled = fields.filter((field) => {
    const value = user[field];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  }).length;
  return Math.round((filled / fields.length) * 100);
}

function coverStyle(user = currentUser) {
  if (user.coverPhoto) return `style="background-image: linear-gradient(rgba(5, 6, 17, 0.08), rgba(5, 6, 17, 0.72)), url('${user.coverPhoto}')"`;
  return "";
}

function renderSettings() {
  const completion = profileCompletion();
  document.getElementById("view").innerHTML = `
    <div class="settings-layout">
      <section class="panel profile-preview-panel">
        <div class="profile-cover" ${coverStyle()}>
          <span class="status accepted">${completion}% complete</span>
        </div>
        <div class="profile-preview-body">
          ${avatarHtml(currentUser, "xl")}
          <div>
            <span class="eyebrow">${esc(currentUser.role)} profile</span>
            <h3>${esc(currentUser.name)}</h3>
            <p>${esc(currentUser.headline || currentUser.title || currentUser.course || "Add a professional headline")}</p>
            <div class="profile-meta">
              <span>${esc(currentUser.location || currentUser.college || currentUser.organization || "Location not added")}</span>
              <span>${esc(currentUser.visibility || "Public")}</span>
              <span>${esc(currentUser.language || "English")}</span>
            </div>
          </div>
        </div>
        <div class="profile-highlight-grid">
          <article><strong>${completion}%</strong><span>Profile strength</span></article>
          <article><strong>${currentUser.role === "mentor" ? `${currentUser.verificationScore || 0}%` : currentUser.skills?.length || 0}</strong><span>${currentUser.role === "mentor" ? "Trust score" : "Skills added"}</span></article>
          <article><strong>${currentUser.role === "mentor" ? currentUser.responseTime || "24h" : currentUser.weeklyHours || "4"}</strong><span>${currentUser.role === "mentor" ? "Response time" : "Weekly hours"}</span></article>
        </div>
      </section>

      <section class="panel">
        <div class="section-title">
          <h3>Edit profile</h3>
          <span class="role-pill">Professional settings</span>
        </div>
        <form class="form two-col" id="profileSettingsForm">
          <fieldset class="photo-field wide">
            <legend>Profile photo and cover photo</legend>
            <div class="media-settings">
              ${settingsPhotoPicker("profilePhoto", "Profile photo", currentUser.profilePhoto)}
              ${settingsPhotoPicker("coverPhoto", "Cover photo", currentUser.coverPhoto)}
            </div>
          </fieldset>

          <label>Full name<input name="name" value="${esc(currentUser.name)}" required /></label>
          <label>Email<input name="email" type="email" value="${esc(currentUser.email)}" required /></label>
          <label>Headline<input name="headline" value="${esc(currentUser.headline || "")}" placeholder="Example: Full stack mentor for final year projects" /></label>
          <label>Location<input name="location" value="${esc(currentUser.location || "")}" placeholder="City, state" /></label>
          <label>Phone<input name="phone" value="${esc(currentUser.phone || "")}" placeholder="+91..." /></label>
          <label>Preferred language<input name="language" value="${esc(currentUser.language || "English")}" /></label>
          <label>Website<input name="website" type="url" value="${esc(currentUser.website || "")}" placeholder="https://your-site.com" /></label>
          <label>LinkedIn<input name="linkedin" type="url" value="${esc(currentUser.linkedin || "")}" placeholder="https://linkedin.com/in/..." /></label>
          <label>GitHub / Portfolio<input name="portfolio" type="url" value="${esc(currentUser.portfolio || currentUser.github || "")}" placeholder="https://github.com/..." /></label>
          <label>Profile visibility<select name="visibility">
            ${["Public", "Only matched users", "Private"].map((item) => `<option ${item === (currentUser.visibility || "Public") ? "selected" : ""}>${item}</option>`).join("")}
          </select></label>

          ${currentUser.role === "mentor" ? mentorSettingsFields() : studentSettingsFields()}

          <label class="wide">Bio<textarea name="bio" rows="4" placeholder="Write a short professional introduction">${esc(currentUser.bio || currentUser.goal || "")}</textarea></label>
          <button class="btn primary wide" type="submit">Save Profile Settings</button>
        </form>
      </section>
    </div>
  `;

  setupSettingsPhotoPickers();
  document.getElementById("profileSettingsForm").addEventListener("submit", handleProfileSettingsSave);
}

function settingsPhotoPicker(name, label, value = "") {
  return `
    <div class="photo-picker compact-photo-picker" data-settings-photo="${name}">
      <div class="photo-preview ${value ? "has-photo" : ""}" data-settings-preview>${value ? `<img src="${value}" alt="${esc(label)}" />` : esc(label)}</div>
      <div class="photo-actions">
        <input name="${name}" type="hidden" value="${esc(value)}" />
        <input class="visually-hidden" data-settings-gallery type="file" accept="image/*" />
        <input class="visually-hidden" data-settings-camera type="file" accept="image/*" capture="user" />
        <button class="btn ghost" type="button" data-settings-open-gallery>Gallery</button>
        <button class="btn ghost" type="button" data-settings-open-camera>Camera</button>
        <button class="btn ghost" type="button" data-settings-clear>Remove</button>
      </div>
    </div>
  `;
}

function setupSettingsPhotoPickers() {
  document.querySelectorAll("[data-settings-photo]").forEach((picker) => {
    const hidden = picker.querySelector("input[type='hidden']");
    const preview = picker.querySelector("[data-settings-preview]");
    const gallery = picker.querySelector("[data-settings-gallery]");
    const camera = picker.querySelector("[data-settings-camera]");
    const updatePreview = (src) => {
      hidden.value = src || "";
      preview.innerHTML = src ? `<img src="${src}" alt="Selected profile image" />` : hidden.name === "coverPhoto" ? "Cover photo" : "Profile photo";
      preview.classList.toggle("has-photo", Boolean(src));
    };
    picker.querySelector("[data-settings-open-gallery]").addEventListener("click", () => gallery.click());
    picker.querySelector("[data-settings-open-camera]").addEventListener("click", () => camera.click());
    picker.querySelector("[data-settings-clear]").addEventListener("click", () => updatePreview(""));
    [gallery, camera].forEach((input) => {
      input.addEventListener("change", () => {
        readImageFile(input.files[0], updatePreview);
        input.value = "";
      });
    });
  });
}

function mentorSettingsFields() {
  return `
    <label>Professional title<input name="title" value="${esc(currentUser.title || "")}" required /></label>
    <label>Organization<input name="organization" value="${esc(currentUser.organization || "")}" required /></label>
    <label>Experience years<input name="experience" type="number" min="0" max="50" value="${esc(currentUser.experience || 0)}" required /></label>
    <label>Session fee<input name="sessionFee" value="${esc(currentUser.sessionFee || "Free / negotiable")}" placeholder="Free, Rs. 300/hr..." /></label>
    <label>Response time<input name="responseTime" value="${esc(currentUser.responseTime || "Within 24 hours")}" /></label>
    <label>Mentoring mode<select name="mentorMode">
      ${["Online", "Offline", "Hybrid"].map((item) => `<option ${item === (currentUser.mentorMode || "Online") ? "selected" : ""}>${item}</option>`).join("")}
    </select></label>
    <label class="wide">Courses completed<input name="courses" value="${esc(currentUser.courses || "")}" required /></label>
    <label class="wide">Expert skills<input name="skills" value="${esc(joinList(currentUser.skills))}" required /></label>
    <label class="wide">Certificate / LinkedIn / portfolio link<input name="credentials" type="url" value="${esc(currentUser.credentials || "")}" required /></label>
    <label class="wide">Availability<input name="availability" value="${esc(currentUser.availability || "")}" required /></label>
  `;
}

function studentSettingsFields() {
  return `
    <label>College<input name="college" value="${esc(currentUser.college || "")}" required /></label>
    <label>Course<input name="course" value="${esc(currentUser.course || "")}" required /></label>
    <label>Semester / year<input name="semester" value="${esc(currentUser.semester || "")}" required /></label>
    <label>Target role<input name="targetRole" value="${esc(currentUser.targetRole || "")}" placeholder="Frontend developer, AI intern..." /></label>
    <label>Learning style<select name="learningStyle">
      ${["Project based", "Step by step", "Interview focused", "Fast track"].map((item) => `<option ${item === (currentUser.learningStyle || "Project based") ? "selected" : ""}>${item}</option>`).join("")}
    </select></label>
    <label>Weekly study hours<input name="weeklyHours" type="number" min="1" max="80" value="${esc(currentUser.weeklyHours || 4)}" /></label>
    <label class="wide">Current skills<input name="skills" value="${esc(joinList(currentUser.skills))}" required /></label>
    <label class="wide">Interested skills<input name="interests" value="${esc(joinList(currentUser.interests))}" required /></label>
    <label class="wide">Goal<input name="goal" value="${esc(currentUser.goal || "")}" required /></label>
  `;
}

function handleProfileSettingsSave(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const updates = {
    name: form.get("name").trim(),
    email: form.get("email").trim().toLowerCase(),
    profilePhoto: form.get("profilePhoto"),
    coverPhoto: form.get("coverPhoto"),
    headline: form.get("headline").trim(),
    location: form.get("location").trim(),
    phone: form.get("phone").trim(),
    language: form.get("language").trim(),
    website: form.get("website").trim(),
    linkedin: form.get("linkedin").trim(),
    portfolio: form.get("portfolio").trim(),
    visibility: form.get("visibility"),
    bio: form.get("bio").trim(),
  };

  if (data.users.some((user) => user.id !== currentUser.id && user.email.toLowerCase() === updates.email)) {
    alert("This email is already used by another account.");
    return;
  }

  if (currentUser.role === "mentor") {
    Object.assign(updates, {
      title: form.get("title").trim(),
      organization: form.get("organization").trim(),
      experience: Number(form.get("experience")),
      sessionFee: form.get("sessionFee").trim(),
      responseTime: form.get("responseTime").trim(),
      mentorMode: form.get("mentorMode"),
      courses: form.get("courses").trim(),
      skills: splitList(form.get("skills")),
      credentials: form.get("credentials").trim(),
      availability: form.get("availability").trim(),
    });
  } else {
    Object.assign(updates, {
      college: form.get("college").trim(),
      course: form.get("course").trim(),
      title: form.get("course").trim(),
      semester: form.get("semester").trim(),
      targetRole: form.get("targetRole").trim(),
      learningStyle: form.get("learningStyle"),
      weeklyHours: form.get("weeklyHours"),
      skills: splitList(form.get("skills")),
      interests: splitList(form.get("interests")),
      goal: form.get("goal").trim(),
    });
  }

  saveCurrentUserUpdates(updates);
  alert("Profile settings saved successfully.");
  render();
}

function viewHeader() {
  const copy = {
    dashboard: ["Dashboard", "Mentorship activity, verification, and learning progress."],
    ai: ["AI Match", "Smart scoring based on goals, skills, courses, and verified experience."],
    mentors: [currentUser.role === "mentor" ? "Mentor Profile" : "Mentor Directory", currentUser.role === "mentor" ? "Your verification and professional details." : "Search verified mentors and request guidance."],
    requests: ["Mentorship Requests", "Track student requests and approval status."],
    sessions: ["Sessions", "Plan mentor meetings and project guidance calls."],
    progress: ["Progress Tracker", "Break learning goals into practical tasks."],
    chat: ["Mentor Chat", "Discuss goals, doubts, and next steps."],
    settings: ["Profile Settings", "Manage your public profile, photos, contact links, and preferences."],
  };
  const [title, subtitle] = copy[activeView];
  return `
    <header class="topbar">
      <div>
        <span class="eyebrow">Skill Connect</span>
        <h2>${esc(title)}</h2>
        <p>${esc(subtitle)}</p>
      </div>
      <span class="role-pill">${esc(currentUser.role)}</span>
    </header>
  `;
}

function renderDashboard() {
  const visibleRequests = currentUser.role === "mentor"
    ? data.requests.filter((request) => request.mentorId === currentUser.id)
    : data.requests.filter((request) => request.studentId === currentUser.id);
  const visibleSessions = currentUser.role === "mentor"
    ? data.sessions.filter((session) => session.mentorId === currentUser.id)
    : data.sessions.filter((session) => session.studentId === currentUser.id);
  const studentId = currentStudentId();
  const visibleTasks = data.tasks.filter((task) => task.studentId === studentId);
  const completed = visibleTasks.filter((task) => task.done).length;
  const progress = visibleTasks.length ? Math.round((completed / visibleTasks.length) * 100) : 0;
  const verifiedMentors = mentors().filter((mentor) => mentor.verificationStatus === "Verified").length;
  const topMatches = rankedMentors().slice(0, 3);

  document.getElementById("view").innerHTML = `
    <section class="dashboard-hero glass-panel">
      <div>
        <span class="eyebrow">AI mentorship platform</span>
        <h3>${currentUser.role === "mentor" ? "Verify. Guide. Grow learners." : "Your personal skill growth cockpit."}</h3>
        <p>${currentUser.role === "mentor" ? "Review requests, schedule sessions, and help students move from confusion to career-ready projects." : "Use AI matching to discover mentors who fit your college course, current skills, and project goal."}</p>
      </div>
      <div class="ring-meter"><strong>${currentUser.role === "mentor" ? currentUser.verificationScore : progress}%</strong><span>${currentUser.role === "mentor" ? "Verified" : "Progress"}</span></div>
    </section>
    <div class="stats">
      <article><span>Verified mentors</span><strong>${verifiedMentors}</strong></article>
      <article><span>Requests</span><strong>${visibleRequests.length}</strong></article>
      <article><span>Sessions</span><strong>${visibleSessions.length}</strong></article>
      <article><span>${currentUser.role === "mentor" ? "Verification" : "Progress"}</span><strong>${currentUser.role === "mentor" ? currentUser.verificationScore : progress}%</strong></article>
    </div>
    <div class="grid two">
      <section class="panel">
        <div class="section-title"><h3>${currentUser.role === "student" ? "Top AI matches" : "Recent student requests"}</h3></div>
        <div class="list">${currentUser.role === "student" ? topMatches.map(mentorCard).join("") || empty("No mentors are registered yet. Ask mentors to create verified accounts first.") : visibleRequests.map(requestItem).join("") || empty("No requests yet.")}</div>
      </section>
      <section class="panel">
        <div class="section-title"><h3>Upcoming sessions</h3></div>
        <div class="list">${visibleSessions.map(sessionItem).join("") || empty("No sessions scheduled yet.")}</div>
      </section>
    </div>
  `;
  attachMentorButtons();
}

function rankedMentors() {
  return mentors().slice().sort((a, b) => mentorMatchScore(b) - mentorMatchScore(a));
}

function renderAiMatch() {
  if (currentUser.role === "mentor") {
    document.getElementById("view").innerHTML = `
      <section class="panel ai-panel">
        <div>
          <span class="eyebrow">Mentor verification AI</span>
          <h3>Your professional trust score is ${currentUser.verificationScore}%</h3>
          <p>The score checks experience, workplace, courses completed, credentials link, and skill depth. Higher scores help students trust your profile.</p>
        </div>
        <div class="insight-grid">
          <article><strong>${currentUser.experience} years</strong><span>Experience</span></article>
          <article><strong>${currentUser.skills.length}</strong><span>Expert skills</span></article>
          <article><strong>${esc(currentUser.verificationStatus)}</strong><span>Status</span></article>
        </div>
      </section>
    `;
    return;
  }

  document.getElementById("view").innerHTML = `
    <section class="panel ai-panel">
      <div class="section-title"><h3>AI recommended mentors</h3><span class="role-pill">Local AI Engine</span></div>
      <div class="mentor-grid">${rankedMentors().map((mentor) => mentorCard(mentor, true)).join("") || empty("No mentors are registered yet. Mentor accounts will appear here after verification.")}</div>
    </section>
    <section class="panel">
      <div class="section-title"><h3>AI learning path</h3></div>
      <div class="timeline">
        ${learningPlan().map((item, index) => `<article><span>0${index + 1}</span><div><h3>${esc(item.title)}</h3><p>${esc(item.detail)}</p></div></article>`).join("")}
      </div>
    </section>
  `;
  attachMentorButtons();
}

function learningPlan() {
  const interest = currentUser.interests?.[0] || "your target skill";
  return [
    { title: "Profile analysis", detail: `Your course is ${currentUser.course}. Focus area detected: ${interest}.` },
    { title: "Mentor matching", detail: "Choose a verified mentor with strong overlap in your goal and skill interest." },
    { title: "Project sprint", detail: "Schedule weekly sessions, complete tasks, and keep chat notes inside Skill Connect." },
  ];
}

function renderMentors() {
  if (currentUser.role === "mentor") {
    document.getElementById("view").innerHTML = `
      <section class="panel profile-detail">
        ${avatarHtml(currentUser, "large")}
        <div>
          <h3>${esc(currentUser.name)}</h3>
          <p>${esc(currentUser.title)} at ${esc(currentUser.organization)}</p>
          <div class="chips">${currentUser.skills.map((skill) => `<span>${esc(skill)}</span>`).join("")}</div>
          <p>${esc(currentUser.bio)}</p>
          <small>Courses: ${esc(currentUser.courses)}</small>
          <small>Credentials: ${esc(currentUser.credentials)}</small>
        </div>
        <span class="status ${currentUser.verificationStatus === "Verified" ? "accepted" : "pending"}">${esc(currentUser.verificationStatus)} - ${currentUser.verificationScore}%</span>
      </section>
    `;
    return;
  }

  document.getElementById("view").innerHTML = `
    <section class="panel">
      <div class="toolbar">
        <label class="search">Search skill<input id="mentorSearch" placeholder="Try AI, Python, UI Design, Web Development" /></label>
        <button class="btn ghost" id="clearSearch">Clear</button>
      </div>
      <div class="mentor-grid" id="mentorList">${rankedMentors().map(mentorCard).join("") || empty("No mentors are registered yet. Use Mentor Register to add the first professional mentor.")}</div>
    </section>
  `;

  document.getElementById("mentorSearch").addEventListener("input", (event) => {
    const query = event.target.value.trim().toLowerCase();
    const filtered = rankedMentors().filter((mentor) => {
      return mentor.name.toLowerCase().includes(query)
        || mentor.title.toLowerCase().includes(query)
        || mentor.organization.toLowerCase().includes(query)
        || mentor.skills.join(" ").toLowerCase().includes(query);
    });
    document.getElementById("mentorList").innerHTML = filtered.map(mentorCard).join("") || empty("No mentor found for this skill.");
    attachMentorButtons();
  });

  document.getElementById("clearSearch").addEventListener("click", () => {
    document.getElementById("mentorSearch").value = "";
    document.getElementById("mentorList").innerHTML = rankedMentors().map(mentorCard).join("") || empty("No mentors are registered yet. Use Mentor Register to add the first professional mentor.");
    attachMentorButtons();
  });
  attachMentorButtons();
}

function initials(name) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function avatarHtml(user, size = "") {
  const sizeClass = size ? ` ${size}` : "";
  if (user?.profilePhoto) {
    return `<div class="avatar${sizeClass} photo-avatar"><img src="${user.profilePhoto}" alt="${esc(user.name)} profile photo" /></div>`;
  }
  return `<div class="avatar${sizeClass}">${initials(user?.name || "User")}</div>`;
}

function mentorCard(mentor, showInsight = false) {
  const score = currentUser?.role === "student" ? mentorMatchScore(mentor) : mentor.verificationScore;
  return `
    <article class="mentor-card">
      <div class="card-top">
        ${avatarHtml(mentor)}
        <span class="match-score">${score}%</span>
      </div>
      <div>
        <h3>${esc(mentor.name)}</h3>
        <p>${esc(mentor.title)} at ${esc(mentor.organization)}</p>
        <div class="chips">${mentor.skills.map((skill) => `<span>${esc(skill)}</span>`).join("")}</div>
        <p>${esc(mentor.bio)}</p>
        <small>${esc(mentor.experience)} years experience | ${esc(mentor.availability)}</small>
        <small class="verify-line">${esc(mentor.verificationStatus)} | Trust ${mentor.verificationScore}%</small>
        ${showInsight ? `<p class="ai-note">${esc(aiRecommendationText(mentor))}</p>` : ""}
      </div>
      ${currentUser?.role === "student" ? `<button class="btn primary" data-request="${mentor.id}">Request Mentor</button>` : ""}
    </article>
  `;
}

function attachMentorButtons() {
  document.querySelectorAll("[data-request]").forEach((button) => {
    button.addEventListener("click", () => {
      const mentor = getUser(button.dataset.request);
      const exists = data.requests.some((request) => request.studentId === currentUser.id && request.mentorId === mentor.id);
      if (exists) {
        alert("You already sent a request to this mentor.");
        return;
      }
      data.requests.push({
        id: uid("r"),
        studentId: currentUser.id,
        mentorId: mentor.id,
        skill: mentor.skills[0],
        message: aiRecommendationText(mentor),
        status: "Pending",
        createdAt: today(),
      });
      data.messages.push({
        id: uid("msg"),
        from: currentUser.id,
        to: mentor.id,
        text: `Hi ${mentor.name}, I want mentorship for ${mentor.skills[0]}.`,
        time: timeNow(),
      });
      saveData();
      activeView = "requests";
      render();
    });
  });
}

function renderRequests() {
  const visibleRequests = currentUser.role === "mentor"
    ? data.requests.filter((request) => request.mentorId === currentUser.id)
    : data.requests.filter((request) => request.studentId === currentUser.id);

  document.getElementById("view").innerHTML = `
    <section class="panel">
      <div class="section-title"><h3>${currentUser.role === "mentor" ? "Requests from students" : "My mentor requests"}</h3></div>
      <div class="list">${visibleRequests.map(requestItem).join("") || empty("No mentorship requests yet.")}</div>
    </section>
  `;

  document.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", () => {
      const [requestId, status] = button.dataset.status.split("|");
      const request = data.requests.find((item) => item.id === requestId);
      request.status = status;
      if (status === "Accepted") {
        data.tasks.push({ id: uid("t"), studentId: request.studentId, title: `Attend first session with ${currentUser.name}`, done: false });
      }
      saveData();
      render();
    });
  });
}

function requestItem(request) {
  const student = getUser(request.studentId);
  const mentor = getUser(request.mentorId);
  return `
    <article class="item">
      <div>
        <h3>${esc(currentUser.role === "mentor" ? student.name : mentor.name)}</h3>
        <p>${esc(request.skill)} | ${esc(request.message)}</p>
        <small>Requested on ${esc(request.createdAt)}</small>
      </div>
      <span class="status ${request.status.toLowerCase()}">${esc(request.status)}</span>
      ${currentUser.role === "mentor" && request.status === "Pending" ? `
        <div class="actions">
          <button class="btn primary" data-status="${request.id}|Accepted">Accept</button>
          <button class="btn danger" data-status="${request.id}|Rejected">Reject</button>
        </div>
      ` : ""}
    </article>
  `;
}

function renderSessions() {
  const visibleSessions = currentUser.role === "mentor"
    ? data.sessions.filter((session) => session.mentorId === currentUser.id)
    : data.sessions.filter((session) => session.studentId === currentUser.id);
  const acceptedRequests = data.requests.filter((request) => {
    return request.status === "Accepted"
      && (currentUser.role === "mentor" ? request.mentorId === currentUser.id : request.studentId === currentUser.id);
  });

  document.getElementById("view").innerHTML = `
    <div class="grid two">
      <section class="panel">
        <div class="section-title"><h3>Schedule session</h3></div>
        ${acceptedRequests.length ? `
          <form class="form" id="sessionForm">
            <label>Mentorship pair<select name="pair" required>
              ${acceptedRequests.map((request) => `<option value="${request.studentId}|${request.mentorId}">${esc(getUser(request.studentId).name)} with ${esc(getUser(request.mentorId).name)}</option>`).join("")}
            </select></label>
            <label>Topic<input name="topic" placeholder="Portfolio review" required /></label>
            <label>Date<input name="date" type="date" required /></label>
            <label>Time<input name="time" type="time" required /></label>
            <button class="btn primary" type="submit">Schedule</button>
          </form>
        ` : empty("Accept or receive a mentor request before scheduling.")}
      </section>
      <section class="panel">
        <div class="section-title"><h3>Session list</h3></div>
        <div class="list">${visibleSessions.map(sessionItem).join("") || empty("No sessions scheduled yet.")}</div>
      </section>
    </div>
  `;

  const form = document.getElementById("sessionForm");
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const [studentId, mentorId] = formData.get("pair").split("|");
    data.sessions.push({
      id: uid("s"),
      studentId,
      mentorId,
      topic: formData.get("topic"),
      date: formData.get("date"),
      time: formData.get("time"),
      status: "Scheduled",
    });
    saveData();
    render();
  });
}

function sessionItem(session) {
  return `
    <article class="item">
      <div>
        <h3>${esc(session.topic)}</h3>
        <p>${esc(getUser(session.studentId).name)} with ${esc(getUser(session.mentorId).name)}</p>
        <small>${esc(session.date)} at ${esc(session.time)}</small>
      </div>
      <span class="status accepted">${esc(session.status)}</span>
    </article>
  `;
}

function renderProgress() {
  const studentId = currentStudentId();
  const studentTasks = data.tasks.filter((task) => task.studentId === studentId);
  const student = getUser(studentId);

  document.getElementById("view").innerHTML = `
    <div class="grid two">
      <section class="panel">
        <div class="section-title"><h3>Add learning task</h3></div>
        ${students().length ? `
          <form class="form" id="taskForm">
            <label>Student<select name="studentId">${students().map((item) => `<option value="${item.id}" ${item.id === studentId ? "selected" : ""}>${esc(item.name)}</option>`).join("")}</select></label>
            <label>Task<input name="title" placeholder="Complete JavaScript basics" required /></label>
            <button class="btn primary" type="submit">Add Task</button>
          </form>
        ` : empty("No student accounts yet.")}
      </section>
      <section class="panel">
        <div class="section-title"><h3>${esc(student?.name || "Student")} progress</h3></div>
        <div class="list">${studentTasks.map(taskItem).join("") || empty("No tasks added yet.")}</div>
      </section>
    </div>
  `;

  const form = document.getElementById("taskForm");
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      data.tasks.push({ id: uid("t"), studentId: formData.get("studentId"), title: formData.get("title"), done: false });
      saveData();
      render();
    });
  }

  document.querySelectorAll("[data-task]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = data.tasks.find((item) => item.id === button.dataset.task);
      task.done = !task.done;
      saveData();
      render();
    });
  });
}

function taskItem(task) {
  return `
    <article class="item task">
      <button class="check ${task.done ? "done" : ""}" data-task="${task.id}">${task.done ? "Done" : "Todo"}</button>
      <div>
        <h3>${esc(task.title)}</h3>
        <p>${task.done ? "Completed" : "In progress"}</p>
      </div>
    </article>
  `;
}

function renderChat() {
  const contacts = currentUser.role === "student"
    ? mentors().filter((mentor) => data.requests.some((request) => request.studentId === currentUser.id && request.mentorId === mentor.id))
    : students().filter((student) => data.requests.some((request) => request.studentId === student.id && request.mentorId === currentUser.id));
  selectedContactId = contacts.some((contact) => contact.id === selectedContactId) ? selectedContactId : contacts[0]?.id;
  const selected = getUser(selectedContactId);
  const messages = selected ? data.messages.filter((message) => {
    return (message.from === currentUser.id && message.to === selected.id) || (message.from === selected.id && message.to === currentUser.id);
  }) : [];

  document.getElementById("view").innerHTML = `
    <section class="panel chat-layout">
      <aside class="contact-list">
        ${contacts.map((contact) => `<button class="${selected?.id === contact.id ? "active" : ""}" data-contact="${contact.id}">${esc(contact.name)}<span>${esc(contact.title || contact.course)}</span></button>`).join("") || empty("Request or accept mentorship before chatting.")}
      </aside>
      <div class="chat-box">
        <div class="section-title"><h3>${esc(selected?.name || "No chat selected")}</h3></div>
        <div class="messages">${messages.map(messageItem).join("") || empty("No messages yet.")}</div>
        ${selected ? `<form class="chat-form" id="messageForm"><input name="message" placeholder="Type your message..." required /><button class="btn primary" type="submit">Send</button></form>` : ""}
      </div>
    </section>
  `;

  document.querySelectorAll("[data-contact]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedContactId = button.dataset.contact;
      render();
    });
  });

  const form = document.getElementById("messageForm");
  if (form && selected) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = new FormData(event.currentTarget).get("message");
      data.messages.push({ id: uid("m"), from: currentUser.id, to: selected.id, text, time: timeNow() });
      saveData();
      render();
    });
  }
}

function messageItem(message) {
  return `<div class="bubble ${message.from === currentUser.id ? "mine" : ""}">${esc(message.text)}<small>${esc(message.time)}</small></div>`;
}

function empty(text) {
  return `<div class="empty">${esc(text)}</div>`;
}

initApp();
