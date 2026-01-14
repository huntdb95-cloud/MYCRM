// tasks-page.js - Tasks page

import { auth } from './firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { initAuthGuard, userStore } from './auth-guard.js';
import { initRouter, navigateTo, getUrlParam } from './router.js';
import { listTasks, createTask, updateTask, deleteTask, getTask } from './tasks.js';
import { formatDateTime } from './models.js';
import { toast, confirm } from './ui.js';

async function init() {
  try {
    console.log('[tasks-page.js] Initializing...');
    await initAuthGuard();
    initRouter();
    setupUI();
    await loadTasks();
    
    // Check if we should open modal for new task
    if (getUrlParam('action') === 'new') {
      const customerId = getUrlParam('customerId');
      openTaskModal(null, customerId);
    }
    
    console.log('[tasks-page.js] Initialized successfully');
  } catch (error) {
    console.error('[tasks-page.js] Failed to initialize:', error);
    toast('Failed to initialize page', 'error');
  }
}

function setupUI() {
  console.log('[tasks-page.js] Setting up UI...');
  
  // User info
  const userNameEl = document.getElementById('userName');
  const userRoleEl = document.getElementById('userRole');
  if (userNameEl) userNameEl.textContent = userStore.displayName || userStore.email || 'User';
  if (userRoleEl) userRoleEl.textContent = userStore.role || '—';
  
  // Logout
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try {
        await signOut(auth);
        navigateTo('/index.html');
      } catch (error) {
        toast('Failed to log out', 'error');
      }
    });
  }
  
  // Menu toggle
  const btnMenuToggle = document.getElementById('btnMenuToggle');
  const sidebar = document.getElementById('sidebar');
  if (btnMenuToggle && sidebar) {
    btnMenuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }
  
  // New task button
  const btnNewTask = document.getElementById('btnNewTask');
  if (btnNewTask) {
    console.log('[tasks-page.js] Add Task button found, attaching handler');
    btnNewTask.addEventListener('click', () => {
      console.log('[tasks-page.js] Add Task button clicked');
      openTaskModal();
    });
  } else {
    console.error('[tasks-page.js] Add Task button (btnNewTask) not found!');
  }
  
  // Modal
  const taskModal = document.getElementById('taskModal');
  const btnCancel = document.getElementById('btnCancel');
  const taskForm = document.getElementById('taskForm');
  
  if (btnCancel) {
    btnCancel.addEventListener('click', closeTaskModal);
  }
  
  if (taskForm) {
    console.log('[tasks-page.js] Task form found, attaching submit handler');
    taskForm.addEventListener('submit', handleTaskSubmit);
  } else {
    console.error('[tasks-page.js] Task form (taskForm) not found!');
  }
  
  if (taskModal) {
    taskModal.addEventListener('click', (e) => {
      if (e.target === taskModal) {
        closeTaskModal();
      }
    });
  }
}

async function loadTasks() {
  try {
    const tasks = await listTasks();
    
    const open = tasks.filter(t => t.status === 'open');
    const inProgress = tasks.filter(t => t.status === 'in-progress');
    const done = tasks.filter(t => t.status === 'done');
    
    renderTasks('tasksOpen', open);
    renderTasks('tasksInProgress', inProgress);
    renderTasks('tasksDone', done);
  } catch (error) {
    console.error('Error loading tasks:', error);
    toast('Failed to load tasks', 'error');
  }
}

function renderTasks(containerId, tasks) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  if (tasks.length === 0) {
    container.innerHTML = '<p class="empty-state">No tasks</p>';
    return;
  }
  
  container.innerHTML = tasks.map(task => `
    <div class="list-item" style="cursor: pointer;" onclick="editTask('${task.id}')">
      <div class="list-item-main">
        <div class="list-item-title">${task.title || 'Untitled Task'}</div>
        <div class="list-item-subtitle">${task.dueAt ? formatDateTime(task.dueAt) : 'No due date'}</div>
      </div>
      <div class="list-item-meta priority-${task.priority || 'med'}">${task.priority || 'med'}</div>
    </div>
  `).join('');
}

window.editTask = async function(taskId) {
  try {
    const task = await getTask(taskId);
    if (!task) {
      toast('Task not found', 'error');
      return;
    }
    
    openTaskModal(task);
  } catch (error) {
    console.error('Error loading task:', error);
    toast('Failed to load task', 'error');
  }
};

function openTaskModal(task = null, customerId = null) {
  console.log('[tasks-page.js] Opening task modal, isEdit:', !!task);
  const modal = document.getElementById('taskModal');
  const modalTitle = document.getElementById('modalTitle');
  const form = document.getElementById('taskForm');
  const taskId = document.getElementById('taskId');
  const errorDiv = document.getElementById('taskFormError');
  
  if (modal) modal.classList.remove('hidden');
  if (modalTitle) modalTitle.textContent = task ? 'Edit Task' : 'New Task';
  if (form) form.reset();
  if (errorDiv) {
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';
  }
  
  // Clear any disabled state on submit button
  const submitBtn = document.querySelector('#taskForm button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save';
  }
  
  if (task) {
    if (taskId) taskId.value = task.id;
    if (document.getElementById('taskTitle')) document.getElementById('taskTitle').value = task.title || '';
    if (document.getElementById('taskDescription')) document.getElementById('taskDescription').value = task.description || '';
    if (document.getElementById('taskPriority')) document.getElementById('taskPriority').value = task.priority || 'med';
    if (document.getElementById('taskDueAt') && task.dueAt) {
      const dueDate = task.dueAt.toDate ? task.dueAt.toDate() : new Date(task.dueAt);
      document.getElementById('taskDueAt').value = dueDate.toISOString().slice(0, 16);
    }
  } else {
    if (taskId) taskId.value = '';
    if (customerId) {
      // Store customerId for form submission
      if (document.getElementById('taskCustomerId')) {
        document.getElementById('taskCustomerId').value = customerId;
      }
    }
  }
}

function closeTaskModal() {
  const modal = document.getElementById('taskModal');
  if (modal) modal.classList.add('hidden');
}

async function handleTaskSubmit(e) {
  e.preventDefault();
  console.log('[tasks-page.js] Task form submitted');
  
  const submitBtn = document.querySelector('#taskForm button[type="submit"]');
  const errorDiv = document.getElementById('taskFormError');
  
  // Clear previous errors
  if (errorDiv) {
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';
  }
  
  // Disable submit button and show loading state
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
  }
  
  try {
    const taskId = document.getElementById('taskId').value;
    const formData = {
      title: document.getElementById('taskTitle').value.trim(),
      description: document.getElementById('taskDescription').value.trim(),
      priority: document.getElementById('taskPriority').value,
      dueAt: document.getElementById('taskDueAt').value || null,
      status: 'open',
    };
    
    console.log('[tasks-page.js] Submitting task form, isEdit:', !!taskId, 'formData:', formData);
    
    const customerId = document.getElementById('taskCustomerId')?.value;
    if (customerId) {
      formData.customerId = customerId;
    }
    
    if (taskId) {
      console.log('[tasks-page.js] Updating task:', taskId);
      await updateTask(taskId, formData);
    } else {
      console.log('[tasks-page.js] Creating new task');
      await createTask(formData);
    }
    
    console.log('[tasks-page.js] Task saved successfully');
    closeTaskModal();
    await loadTasks();
  } catch (error) {
    console.error('[tasks-page.js] Error saving task:', error);
    console.error('[tasks-page.js] Error stack:', error.stack);
    
    const errorMsg = error?.message || 'Failed to save task. Please try again.';
    
    // Show error in form
    if (errorDiv) {
      errorDiv.textContent = errorMsg;
      errorDiv.style.display = 'block';
    }
    
    // Also show toast
    toast(errorMsg, 'error');
  } finally {
    // Re-enable submit button
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save';
    }
  }
}

init();
