"use strict";

const API_URL = "/api/tasks";
const AUTH_URL = "/api/auth";

// Authentication elements
const authScreen = document.getElementById("authScreen");
const appScreen = document.getElementById("appScreen");

const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const authMessage = document.getElementById("authMessage");
const logoutBtn = document.getElementById("logoutBtn");

const userName = document.getElementById("userName");
const userEmail = document.getElementById("userEmail");
const userAvatar = document.getElementById("userAvatar");

// Dashboard elements
const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const taskList = document.getElementById("taskList");
const searchInput = document.getElementById("searchInput");
const message = document.getElementById("message");
const addTaskBtn = document.getElementById("addTaskBtn");

const filterButtons = document.querySelectorAll(".filter-btn");

let tasks = [];
let currentFilter = "all";
let token = sessionStorage.getItem("taskflow_token");
let sessionVersion = 0;

// DISPLAY MESSAGES
function displayMessage(element, text, type = "error") {
  element.textContent = text;
  element.className = `message ${type}`;

  setTimeout(() => {
    if (element.textContent === text) {
      element.textContent = "";
      element.className = "message";
    }
  }, 4000);
}

function showMessage(text, type = "error") {
  displayMessage(message, text, type);
}

function showAuthMessage(text, type = "error") {
  displayMessage(authMessage, text, type);
}

// API REQUESTS
async function apiRequest(url, options = {}) {
  const headers = {
    ...options.headers
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(url, {
      ...options,
      headers
    });
  } catch {
    throw new Error(
      "Cannot connect to the server. Check that TaskFlow is running."
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an invalid response.");
  }

  if (!response.ok) {
    const error = new Error(
      data.message || "Something went wrong."
    );

    error.status = response.status;
    throw error;
  }

  return data;
}

// AUTHENTICATION TABS
function switchAuthTab(tab) {
  const isLogin = tab === "login";

  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;

  loginTab.classList.toggle("active", isLogin);
  registerTab.classList.toggle("active", !isLogin);

  loginTab.setAttribute("aria-pressed", String(isLogin));
  registerTab.setAttribute("aria-pressed", String(!isLogin));

  authMessage.textContent = "";
  authMessage.className = "message";
}

loginTab.addEventListener("click", () => {
  switchAuthTab("login");
});

registerTab.addEventListener("click", () => {
  switchAuthTab("register");
});

// SHOW LOGIN SCREEN
function showLoginScreen() {
  authScreen.hidden = false;
  appScreen.hidden = true;
}

// SHOW DASHBOARD
function showDashboard(user) {
  userName.textContent = user.name;
  userEmail.textContent = user.email;

  const initials = user.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join("");

  userAvatar.textContent = initials || "U";

  authScreen.hidden = true;
  appScreen.hidden = false;
}

// CLEAR SESSION
function clearSession() {
  sessionVersion++;

  token = null;
  sessionStorage.removeItem("taskflow_token");

  tasks = [];
  currentFilter = "all";

  taskInput.value = "";
  searchInput.value = "";

  filterButtons.forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.filter === "all"
    );
  });

  updateDashboard();
  renderTasks();

  loginForm.reset();
  registerForm.reset();

  message.textContent = "";
  message.className = "message";

  showLoginScreen();
}

// HANDLE AUTHENTICATION ERRORS
function handleError(error, authenticationRequest = false) {
  if (error.status === 401 && !authenticationRequest) {
    clearSession();
    switchAuthTab("login");

    showAuthMessage(
      "Your session has expired. Please sign in again."
    );

    return;
  }

  if (authenticationRequest) {
    showAuthMessage(error.message);
  } else {
    showMessage(error.message);
  }
}

// SAVE AUTHENTICATED SESSION
async function startSession(data) {
  if (!data.token || !data.user) {
    throw new Error("Invalid authentication response.");
  }

  sessionVersion++;

  token = data.token;
  sessionStorage.setItem("taskflow_token", token);

  showDashboard(data.user);

  loginForm.reset();
  registerForm.reset();

  await loadTasks();
}

// REGISTER
registerForm.addEventListener("submit", async event => {
  event.preventDefault();

  const name = document.getElementById("registerName").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;

  if (!name || !email || password.length < 8) {
    showAuthMessage(
      "Enter your name, email, and a password of at least 8 characters."
    );
    return;
  }

  const submitButton = registerForm.querySelector(
    'button[type="submit"]'
  );

  submitButton.disabled = true;

  try {
    const data = await apiRequest(`${AUTH_URL}/register`, {
      method: "POST",
      body: JSON.stringify({
        name,
        email,
        password
      })
    });

    await startSession(data);
  } catch (error) {
    handleError(error, true);
  } finally {
    submitButton.disabled = false;
  }
});

// LOGIN
loginForm.addEventListener("submit", async event => {
  event.preventDefault();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  const submitButton = loginForm.querySelector(
    'button[type="submit"]'
  );

  submitButton.disabled = true;

  try {
    const data = await apiRequest(`${AUTH_URL}/login`, {
      method: "POST",
      body: JSON.stringify({
        email,
        password
      })
    });

    await startSession(data);
  } catch (error) {
    handleError(error, true);
  } finally {
    submitButton.disabled = false;
  }
});

// LOGOUT
logoutBtn.addEventListener("click", () => {
  clearSession();
  switchAuthTab("login");

  showAuthMessage(
    "You have signed out successfully.",
    "success"
  );
});

// RESTORE EXISTING SESSION
async function restoreSession() {
  if (!token) {
    showLoginScreen();
    return;
  }

  const version = sessionVersion;

  try {
    const user = await apiRequest(`${AUTH_URL}/me`);

    if (version !== sessionVersion) return;

    showDashboard(user);
    await loadTasks();
  } catch (error) {
    if (version !== sessionVersion) return;

    clearSession();
    switchAuthTab("login");

    showAuthMessage(
      "Please sign in to access your workspace."
    );
  }
}

// LOAD TASKS
async function loadTasks() {
  const version = sessionVersion;

  try {
    const result = await apiRequest(API_URL);

    if (version !== sessionVersion) return;

    tasks = result;
    updateDashboard();
    renderTasks();
  } catch (error) {
    if (version !== sessionVersion) return;

    handleError(error);
  }
}

// UPDATE DASHBOARD STATISTICS
function updateDashboard() {
  const total = tasks.length;

  const completed = tasks.filter(
    task => task.completed
  ).length;

  const pending = total - completed;

  const progress = total === 0
    ? 0
    : Math.round((completed / total) * 100);

  document.getElementById("totalTasks").textContent = total;
  document.getElementById("pendingTasks").textContent = pending;
  document.getElementById("completedTasks").textContent = completed;
  document.getElementById("progress").textContent = `${progress}%`;

  document.getElementById("taskCount").textContent =
    `${total} ${total === 1 ? "task" : "tasks"}`;
}

// DISPLAY TASKS
function renderTasks() {
  const searchTerm = searchInput.value.toLowerCase().trim();

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title
      .toLowerCase()
      .includes(searchTerm);

    const matchesFilter =
      currentFilter === "all" ||
      (currentFilter === "completed" && task.completed) ||
      (currentFilter === "pending" && !task.completed);

    return matchesSearch && matchesFilter;
  });

  taskList.replaceChildren();

  if (filteredTasks.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";

    const icon = document.createElement("div");
    icon.className = "empty-icon";
    icon.textContent = "☑";

    const heading = document.createElement("h3");
    heading.textContent = tasks.length === 0
      ? "No tasks yet"
      : "No matching tasks";

    const description = document.createElement("p");
    description.textContent = tasks.length === 0
      ? "Add your first task to get started."
      : "Try changing your search or filter.";

    emptyState.append(icon, heading, description);
    taskList.appendChild(emptyState);

    return;
  }

  filteredTasks.forEach(task => {
    const item = document.createElement("div");
    item.className = "task-item";

    const info = document.createElement("div");
    info.className = "task-info";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-checkbox";
    checkbox.checked = task.completed;

    checkbox.setAttribute(
      "aria-label",
      `Complete ${task.title}`
    );

    checkbox.addEventListener("change", async () => {
      const newCompleted = checkbox.checked;
      checkbox.disabled = true;

      try {
        await apiRequest(`${API_URL}/${task.id}`, {
          method: "PUT",
          body: JSON.stringify({
            completed: newCompleted
          })
        });

        await loadTasks();
      } catch (error) {
        checkbox.checked = !newCompleted;
        handleError(error);
      } finally {
        checkbox.disabled = false;
      }
    });

    const title = document.createElement("span");

    title.className = task.completed
      ? "task-title completed"
      : "task-title";

    title.textContent = task.title;

    info.append(checkbox, title);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    // EDIT TASK
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "action-btn edit-btn";
    editButton.textContent = "Edit";

    editButton.addEventListener("click", async () => {
      const newTitle = prompt("Edit task:", task.title);

      if (newTitle === null) return;

      const trimmedTitle = newTitle.trim();

      if (!trimmedTitle) {
        showMessage("Task title cannot be empty.");
        return;
      }

      if (trimmedTitle.length > 150) {
        showMessage(
          "Task title must be 150 characters or fewer."
        );
        return;
      }

      editButton.disabled = true;

      try {
        await apiRequest(`${API_URL}/${task.id}`, {
          method: "PUT",
          body: JSON.stringify({
            title: trimmedTitle
          })
        });

        await loadTasks();

        showMessage(
          "Task updated successfully.",
          "success"
        );
      } catch (error) {
        handleError(error);
      } finally {
        editButton.disabled = false;
      }
    });

    // DELETE TASK
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "action-btn delete-btn";
    deleteButton.textContent = "Delete";

    deleteButton.addEventListener("click", async () => {
      const confirmed = confirm(
        `Delete "${task.title}"?`
      );

      if (!confirmed) return;

      deleteButton.disabled = true;

      try {
        await apiRequest(`${API_URL}/${task.id}`, {
          method: "DELETE"
        });

        await loadTasks();

        showMessage(
          "Task deleted successfully.",
          "success"
        );
      } catch (error) {
        handleError(error);
      } finally {
        deleteButton.disabled = false;
      }
    });

    actions.append(editButton, deleteButton);
    item.append(info, actions);

    taskList.appendChild(item);
  });
}

// ADD TASK
taskForm.addEventListener("submit", async event => {
  event.preventDefault();

  const title = taskInput.value.trim();

  if (!title) {
    showMessage("Please enter a task.");
    return;
  }

  if (title.length > 150) {
    showMessage(
      "Task title must be 150 characters or fewer."
    );
    return;
  }

  addTaskBtn.disabled = true;

  try {
    await apiRequest(API_URL, {
      method: "POST",
      body: JSON.stringify({
        title
      })
    });

    taskInput.value = "";

    await loadTasks();

    showMessage(
      "Task added successfully.",
      "success"
    );
  } catch (error) {
    handleError(error);
  } finally {
    addTaskBtn.disabled = false;
  }
});

// TASK FILTERS
filterButtons.forEach(button => {
  button.addEventListener("click", () => {
    filterButtons.forEach(btn => {
      btn.classList.remove("active");
    });

    button.classList.add("active");
    currentFilter = button.dataset.filter;

    renderTasks();
  });
});

// SEARCH TASKS
searchInput.addEventListener("input", renderTasks);

// SIDEBAR NAVIGATION
document.querySelectorAll(".nav-link").forEach(link => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".nav-link").forEach(item => {
      item.classList.remove("active");
    });

    link.classList.add("active");
  });
});

// START APPLICATION
switchAuthTab("login");
restoreSession();