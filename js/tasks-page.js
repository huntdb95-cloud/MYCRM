// tasks-page.js - Tasks page

import { auth } from './firebase.js';
import { signOut } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { initAuthGuard, userStore } from './auth-guard.js';
import { initRouter, navigateTo, getUrlParam } from './router.js';
import { listTasks, createTask, updateTask, deleteTask, getTask } from './tasks.js';
import { formatDateTime } from './models.js';
import { toast, confirm } from './ui.js';

let calendar = null;
let allTasks = [];

async function init() {
  try {
    console.log('[tasks-page.js] Initializing...');
    await initAuthGuard();
    initRouter();
    setupUI();
    initCalendar();
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

/**
 * Setup calendar controls (view toggle, navigation)
 */
function setupCalendarControls() {
  // View toggle buttons
  const viewButtons = document.querySelectorAll('.view-btn');
  viewButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (calendar) {
        calendar.changeView(view);
        viewButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });
  });
  
  // Navigation buttons
  const btnPrev = document.getElementById('btnCalendarPrev');
  const btnNext = document.getElementById('btnCalendarNext');
  const btnToday = document.getElementById('btnCalendarToday');
  
  if (btnPrev && calendar) {
    btnPrev.addEventListener('click', () => {
      calendar.prev();
    });
  }
  
  if (btnNext && calendar) {
    btnNext.addEventListener('click', () => {
      calendar.next();
    });
  }
  
  if (btnToday && calendar) {
    btnToday.addEventListener('click', () => {
      calendar.today();
    });
  }
}

/**
 * Initialize FullCalendar
 */
function initCalendar() {
  const calendarEl = document.getElementById('calendar');
  if (!calendarEl) {
    console.warn('[tasks-page.js] Calendar element not found');
    return;
  }
  
  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    headerToolbar: false, // We have custom controls
    height: 'auto',
    firstDay: 0, // Sunday
    eventClick: function(info) {
      const taskId = info.event.id;
      if (taskId) {
        editTask(taskId);
      }
    },
    dateClick: function(info) {
      // Optional: pre-fill date when clicking empty date
      const clickedDate = info.dateStr;
      openTaskModal(null, null, clickedDate);
    },
    events: function(fetchInfo, successCallback, failureCallback) {
      try {
        // Convert tasks to calendar events
        const events = allTasks
          .filter(task => task.dueAt)
          .map(task => {
            const dueDate = task.dueAt.toDate ? task.dueAt.toDate() : new Date(task.dueAt);
            const hasTime = inferHasTime(task);
            
            return {
              id: task.id,
              title: task.title || 'Untitled Task',
              start: dueDate.toISOString(),
              allDay: !hasTime,
              backgroundColor: getPriorityColor(task.priority || 'med'),
              borderColor: getPriorityColor(task.priority || 'med'),
              textColor: '#ffffff',
              extendedProps: {
                task: task
              }
            };
          });
        
        successCallback(events);
      } catch (error) {
        console.error('[tasks-page.js] Error loading calendar events:', error);
        failureCallback(error);
      }
    }
  });
  
  calendar.render();
  
  // Setup calendar controls after calendar is rendered
  setupCalendarControls();
}

/**
 * Get color for priority
 */
function getPriorityColor(priority) {
  switch (priority) {
    case 'high':
      return '#fb7185'; // danger/red
    case 'med':
      return '#3b82f6'; // primary/blue
    case 'low':
      return '#8b9dc3'; // muted/gray
    default:
      return '#3b82f6';
  }
}

/**
 * Infer hasTime for backward compatibility
 * If hasTime is not set, check if time is exactly 12:00 PM (our default for no-time tasks)
 */
function inferHasTime(task) {
  if (task.hasTime !== undefined) {
    return task.hasTime === true;
  }
  
  // Backward compatibility: if hasTime is not set, infer from dueAt
  if (!task.dueAt) {
    return false;
  }
  
  const dueDate = task.dueAt.toDate ? task.dueAt.toDate() : new Date(task.dueAt);
  const hours = dueDate.getHours();
  const minutes = dueDate.getMinutes();
  
  // If time is exactly 12:00 PM, assume it's a no-time task
  return !(hours === 12 && minutes === 0);
}

/**
 * Sort tasks according to ordering rules
 */
function sortTasks(tasks) {
  return tasks.sort((a, b) => {
    // If no due date, put at end
    if (!a.dueAt && !b.dueAt) {
      // Both have no due date - sort by createdAt desc (newest first)
      const aCreated = a.createdAt?.toDate ? a.createdAt.toDate() : (a.createdAt ? new Date(a.createdAt) : new Date(0));
      const bCreated = b.createdAt?.toDate ? b.createdAt.toDate() : (b.createdAt ? new Date(b.createdAt) : new Date(0));
      return bCreated - aCreated;
    }
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    
    // Get dates
    const aDate = a.dueAt.toDate ? a.dueAt.toDate() : new Date(a.dueAt);
    const bDate = b.dueAt.toDate ? b.dueAt.toDate() : new Date(b.dueAt);
    
    // Compare by date (date-only, ignoring time for date comparison)
    const aDateOnly = new Date(aDate.getFullYear(), aDate.getMonth(), aDate.getDate());
    const bDateOnly = new Date(bDate.getFullYear(), bDate.getMonth(), bDate.getDate());
    const dateDiff = aDateOnly - bDateOnly;
    
    if (dateDiff !== 0) {
      return dateDiff; // Different dates - sort by date ascending
    }
    
    // Same date - check hasTime (with backward compatibility)
    const aHasTime = inferHasTime(a);
    const bHasTime = inferHasTime(b);
    
    if (aHasTime && bHasTime) {
      // Both have time - sort by time ascending
      return aDate - bDate;
    }
    
    if (aHasTime && !bHasTime) {
      return -1; // a has time, b doesn't - a comes first
    }
    
    if (!aHasTime && bHasTime) {
      return 1; // b has time, a doesn't - b comes first
    }
    
    // Both have no time on same date - sort by priority then createdAt
    const priorityOrder = { high: 3, med: 2, low: 1 };
    const aPriority = priorityOrder[a.priority] || 2;
    const bPriority = priorityOrder[b.priority] || 2;
    const priorityDiff = bPriority - aPriority; // Higher priority first
    
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    
    // Same priority - sort by createdAt ascending (entry order)
    const aCreated = a.createdAt?.toDate ? a.createdAt.toDate() : (a.createdAt ? new Date(a.createdAt) : new Date(0));
    const bCreated = b.createdAt?.toDate ? b.createdAt.toDate() : (b.createdAt ? new Date(b.createdAt) : new Date(0));
    const createdDiff = aCreated - bCreated;
    
    if (createdDiff !== 0) {
      return createdDiff;
    }
    
    // Final tie-breaker: task id
    return a.id.localeCompare(b.id);
  });
}

async function loadTasks() {
  try {
    const tasks = await listTasks();
    
    // Store all tasks
    allTasks = tasks;
    
    // Sort tasks according to ordering rules
    const sortedTasks = sortTasks([...tasks]);
    
    // Filter by status
    const open = sortedTasks.filter(t => t.status === 'open');
    const inProgress = sortedTasks.filter(t => t.status === 'in-progress');
    const done = sortedTasks.filter(t => t.status === 'done');
    
    renderTasks('tasksOpen', open);
    renderTasks('tasksInProgress', inProgress);
    renderTasks('tasksDone', done);
    
    // Refresh calendar
    if (calendar) {
      calendar.refetchEvents();
    }
  } catch (error) {
    console.error('Error loading tasks:', error);
    console.error('Error details:', { uid: userStore.uid, agencyId: userStore.agencyId, code: error.code, message: error.message });
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

function openTaskModal(task = null, customerId = null, prefillDate = null) {
  console.log('[tasks-page.js] Opening task modal, isEdit:', !!task);
  const modal = document.getElementById('taskModal');
  const modalTitle = document.getElementById('modalTitle');
  const form = document.getElementById('taskForm');
  const taskId = document.getElementById('taskId');
  const errorDiv = document.getElementById('taskFormError');
  const taskDueDate = document.getElementById('taskDueDate');
  const taskDueTime = document.getElementById('taskDueTime');
  
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
    // Edit mode
    if (taskId) taskId.value = task.id;
    if (document.getElementById('taskTitle')) document.getElementById('taskTitle').value = task.title || '';
    if (document.getElementById('taskDescription')) document.getElementById('taskDescription').value = task.description || '';
    if (document.getElementById('taskPriority')) document.getElementById('taskPriority').value = task.priority || 'med';
    
    // Handle separate date and time fields
    if (task.dueAt) {
      const dueDate = task.dueAt.toDate ? task.dueAt.toDate() : new Date(task.dueAt);
      const hasTime = inferHasTime(task);
      
      // Set date (YYYY-MM-DD format)
      if (taskDueDate) {
        const year = dueDate.getFullYear();
        const month = String(dueDate.getMonth() + 1).padStart(2, '0');
        const day = String(dueDate.getDate()).padStart(2, '0');
        taskDueDate.value = `${year}-${month}-${day}`;
      }
      
      // Set time if hasTime
      if (taskDueTime) {
        if (hasTime) {
          const hours = String(dueDate.getHours()).padStart(2, '0');
          const minutes = String(dueDate.getMinutes()).padStart(2, '0');
          taskDueTime.value = `${hours}:${minutes}`;
        } else {
          taskDueTime.value = '';
        }
      }
    }
  } else {
    // New task mode
    if (taskId) taskId.value = '';
    
    // Set default due date to today (or prefillDate if provided)
    if (taskDueDate) {
      const today = prefillDate ? new Date(prefillDate) : new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      taskDueDate.value = `${year}-${month}-${day}`;
    }
    
    // Time field is empty by default (hasTime=false)
    if (taskDueTime) {
      taskDueTime.value = '';
    }
    
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
    const taskDueDate = document.getElementById('taskDueDate').value;
    const taskDueTime = document.getElementById('taskDueTime').value;
    
    if (!taskDueDate) {
      throw new Error('Due date is required');
    }
    
    const formData = {
      title: document.getElementById('taskTitle').value.trim(),
      description: document.getElementById('taskDescription').value.trim(),
      priority: document.getElementById('taskPriority').value,
      dueDate: taskDueDate,
      dueTime: taskDueTime || '', // Empty string if no time
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
