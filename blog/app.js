import { ReactiveStore }       from '@adukiorg/native/state';
import { Database }            from '@adukiorg/native/storage';
import { events }              from '@adukiorg/native/events';
import { queue }               from '@adukiorg/native/offline';
import { animate, stagger }    from '@adukiorg/native/animations';

// 1. Initialize IndexedDB Storage
const db = new Database('antigravity_blog', 1, [
  (dbInstance) => {
    dbInstance.createObjectStore('stories');
  }
]);

// 2. Initialize Reactive State Store
const store = new ReactiveStore({
  posts: [],
  filter: 'all',
  online: true
});

// Seed Initial Data (if IndexedDB is empty)
const SEED_POSTS = [
  {
    id: 'post-1',
    title: 'Architecting High-Performance Web Apps with Native Platform APIs',
    tag: 'tech',
    content: 'Modern browsers provide extremely robust components natively: Web Locks, custom elements, shadow DOM boundaries, and background synchronization APIs. By bypassing heavy build pipelines and relying on native ESM, we achieve unmatched TTFB and INP metrics.',
    created: Date.now() - 36000000
  },
  {
    id: 'post-2',
    title: 'The Premium Edge: Elevating Web UX with Curated Aesthetic Tokens',
    tag: 'design',
    content: 'Visual fidelity is not about heavy styling frameworks; it is about micro-interactions, cohesive color scales, glassmorphism blur layers, and dynamic layouts that react natively to the cursor. A premium application details every pixel.',
    created: Date.now() - 72000000
  },
  {
    id: 'post-3',
    title: 'Simplicity as a Architecture Standard',
    tag: 'lifestyle',
    content: 'Engineering is the discipline of removing complexity until nothing remains but utility and elegance. Reducing structural dependencies in browser runtimes is not a step backward—it is a leap into the native future.',
    created: Date.now() - 108000000
  }
];

// Initialize Application Modules
async function init() {
  await db.open();
  
  // Hydrate Store from IndexedDB stories store
  let savedPosts = await db.getAll('stories');
  if (!savedPosts || savedPosts.length === 0) {
    // Seed initial posts into IndexedDB
    for (const post of SEED_POSTS) {
      await db.set('stories', post.id, post);
    }
    savedPosts = SEED_POSTS;
  }

  // Sort by date descending
  savedPosts.sort((a, b) => b.created - a.created);
  store.set('posts', savedPosts);

  // Setup DOM Event Listeners & State Subscriptions
  setupDOMListeners();
  setupStateSubscriptions();
  
  // Stagger-animate initial cards entry!
  triggerStaggerEntrance();
}

// 3. Setup Reactive Store Subscriptions (Dynamic Optimistic UI Update)
function setupStateSubscriptions() {
  // Render stream list when posts or filters mutate
  const updatePostsUI = () => {
    const posts = store.get('posts') || [];
    const filter = store.get('filter') || 'all';
    const streamContainer = document.getElementById('posts-stream');

    const filtered = filter === 'all' 
      ? posts 
      : posts.filter(p => p.tag === filter);

    if (filtered.length === 0) {
      streamContainer.innerHTML = `
        <div class="post-card" style="text-align: center;">
          <p>No stories published yet in this category.</p>
        </div>
      `;
      return;
    }

    // Map posts to dynamic card nodes
    streamContainer.innerHTML = filtered.map(post => `
      <article class="post-card" id="${post.id}">
        <div class="post-meta">
          <span class="post-tag-badge ${post.tag}">${post.tag}</span>
          <span class="post-time">${new Date(post.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <h2>${post.title}</h2>
        <p>${post.content}</p>
      </article>
    `).join('');
  };

  store.subscribe('posts', updatePostsUI);
  store.subscribe('filter', updatePostsUI);

  // Subscribe to Online/Offline state to toggle UI widgets
  store.subscribe('online', (val) => {
    const indicator = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');
    const toggleBtn = document.getElementById('network-toggle-btn');
    
    const isOnline = store.get('online');
    if (isOnline) {
      indicator.className = 'status-indicator online';
      text.textContent = 'Online Mode';
      toggleBtn.textContent = 'Go Offline';
    } else {
      indicator.className = 'status-indicator offline';
      text.textContent = 'Offline Mode';
      toggleBtn.textContent = 'Go Online';
    }
  });
}

// 4. Setup User & Network Event Listeners
function setupDOMListeners() {
  // Category tags chips click handling
  const chips = document.querySelectorAll('.filter-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', (e) => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      
      const filter = chip.getAttribute('data-filter');
      store.set('filter', filter);
      
      // Animate entry for newly filtered view
      triggerStaggerEntrance();
    });
  });

  // Offline / Online Toggler Simulator
  const networkBtn = document.getElementById('network-toggle-btn');
  networkBtn.addEventListener('click', () => {
    const nextState = !store.get('online');
    store.set('online', nextState);
    
    events.emit('network:status', { online: nextState });

    // Sync any queued offline operations immediately when coming online
    if (nextState) {
      syncOfflineQueue();
    }
  });

  // Form Publish Story submission
  const form = document.getElementById('post-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const titleInput = document.getElementById('post-title');
    const tagSelect = document.getElementById('post-tag');
    const contentText = document.getElementById('post-content');

    const newPost = {
      id: `post-${Date.now()}`,
      title: titleInput.value,
      tag: tagSelect.value,
      content: contentText.value,
      created: Date.now()
    };

    // Reset Form fields
    form.reset();

    // Push new post to local reactive state immediately (Optimistic UI Update!)
    const currentPosts = store.get('posts') || [];
    store.set('posts', [newPost, ...currentPosts]);

    // Animate newly created card entry
    setTimeout(() => {
      const card = document.getElementById(newPost.id);
      if (card) {
        animate(card, [
          { transform: 'translateY(30px)', opacity: 0 },
          { transform: 'translateY(0)', opacity: 1 }
        ], { duration: 400, easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)' });
      }
    }, 50);

    // Enqueue operation in offline queue
    enqueueSyncOperation(newPost);
  });
}

// 5. Optimistic Sync & Queue Coordination
async function enqueueSyncOperation(post) {
  // Define task schema
  const task = {
    id: `task-${post.id}`,
    action: 'CREATE_POST',
    payload: post,
    timestamp: Date.now()
  };

  // Persist story locally into IndexedDB immediately
  await db.set('stories', post.id, post);

  // If client is offline, add to enqueued queue registry
  if (!store.get('online')) {
    queue.push(task);
    updateQueueWidget();
  } else {
    // Online: simulate immediate network server write
    simulateServerWrite(task);
  }
}

// Synchronize Enqueued Tasks when returning Online
async function syncOfflineQueue() {
  const pending = queue.list() || [];
  if (pending.length === 0) return;

  for (const task of pending) {
    // Process server upload
    await simulateServerWrite(task);
    // Remove from queue
    queue.remove(task.id);
  }

  updateQueueWidget();
}

// Simulated Remote Server Post Endpoint via Pipeline
async function simulateServerWrite(task) {
  return new Promise((resolve) => {
    // Show quick visual sync status
    console.log(`Syncing task ${task.id} to cloud server...`, task.payload);
    setTimeout(resolve, 800);
  });
}

// Update the Sidebar pending operations widget
function updateQueueWidget() {
  const listContainer = document.getElementById('queue-list');
  const badge = document.getElementById('queue-badge');
  const pending = queue.list() || [];

  badge.textContent = `${pending.length} pending`;

  if (pending.length === 0) {
    listContainer.innerHTML = '<div class="empty-queue">No pending sync tasks</div>';
    return;
  }

  listContainer.innerHTML = pending.map(task => `
    <div class="queue-item" id="${task.id}">
      <span class="queue-item-title">${task.payload.title}</span>
      <span class="queue-item-action">Queued Sync</span>
    </div>
  `).join('');
}

// 6. Premium Stagger Entrance Animation Effect
function triggerStaggerEntrance() {
  setTimeout(() => {
    const cards = document.querySelectorAll('.post-card');
    if (cards.length > 0) {
      stagger(Array.from(cards), [
        { transform: 'translateY(25px)', opacity: 0 },
        { transform: 'translateY(0)', opacity: 1 }
      ], { duration: 300, staggerDelay: 80, easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)' });
    }
  }, 40);
}

// Bootstrap Application
init();
