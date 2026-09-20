const DB_NAME = 'noto-audio-library';
const STORE_NAME = 'recordings';
const COURSE_KEY = 'noto-courses';

const state = {
  courses: loadCourses(),
  selectedCourseId: null,
  view: 'home',
  recording: null,
};

const elements = {
  courseGrid: document.getElementById('courseGrid'),
  courseCount: document.getElementById('courseCount'),
  courseTitle: document.getElementById('courseTitle'),
  recordingList: document.getElementById('recordingList'),
  recordingCount: document.getElementById('recordingCount'),
  recordingStatus: document.getElementById('recordingStatus'),
  recordBtn: document.getElementById('recordBtn'),
  recordButtonLabel: document.getElementById('recordButtonLabel'),
  audioFileInput: document.getElementById('audioFileInput'),
  courseModal: document.getElementById('courseModal'),
  modalTitle: document.getElementById('modalTitle'),
  courseNameInput: document.getElementById('courseNameInput'),
  courseForm: document.getElementById('courseForm'),
  toast: document.getElementById('toast'),
};

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function loadCourses() {
  try {
    const courses = JSON.parse(localStorage.getItem(COURSE_KEY) || '[]');
    return Array.isArray(courses) ? courses : [];
  } catch {
    return [];
  }
}

function saveCourses() {
  localStorage.setItem(COURSE_KEY, JSON.stringify(state.courses));
}

function selectedCourse() {
  return state.courses.find((course) => course.id === state.selectedCourseId);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveAudio(recording) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(recording);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function getCourseAudio(courseId) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result.filter((recording) => recording.courseId === courseId));
    request.onerror = () => reject(request.error);
  });
}

async function deleteAudio(recordingId) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(recordingId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => elements.toast.classList.remove('is-visible'), 2800);
}

function openCourseModal(mode) {
  elements.modalTitle.textContent = mode === 'rename' ? 'Renommer le cours' : 'Nouveau cours';
  elements.courseNameInput.value = mode === 'rename' ? selectedCourse()?.name || '' : '';
  elements.courseForm.dataset.mode = mode;
  elements.courseModal.classList.remove('is-hidden');
  elements.courseNameInput.focus();
}

function closeCourseModal() {
  elements.courseModal.classList.add('is-hidden');
  elements.courseForm.reset();
}

function showView(view) {
  state.view = view;
  document.querySelectorAll('[data-view]').forEach((section) => section.classList.toggle('is-hidden', section.dataset.view !== view));
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('is-active', item.dataset.targetView === view));
  render();
}

function createCourse(name) {
  const course = { id: createId(), name: name.trim(), createdAt: Date.now() };
  state.courses.unshift(course);
  state.selectedCourseId = course.id;
  saveCourses();
  closeCourseModal();
  showView('course');
}

function renameCourse(name) {
  const course = selectedCourse();
  if (!course) return;
  course.name = name.trim();
  saveCourses();
  closeCourseModal();
  render();
}

async function removeCourse() {
  const course = selectedCourse();
  if (!course || !window.confirm(`Supprimer le cours « ${course.name} » ?`)) return;
  const recordings = await getCourseAudio(course.id);
  await Promise.all(recordings.map((recording) => deleteAudio(recording.id)));
  state.courses = state.courses.filter((item) => item.id !== course.id);
  state.selectedCourseId = state.courses[0]?.id || null;
  saveCourses();
  showView('home');
}

function renderCourses() {
  elements.courseCount.textContent = `${state.courses.length} cours`;
  if (!state.courses.length) {
    elements.courseGrid.innerHTML = '<div class="empty-state">Aucun cours. Créez votre premier cours pour commencer.</div>';
    return;
  }
  elements.courseGrid.innerHTML = state.courses.map((course) => `
    <button class="course-card" type="button" data-course-id="${course.id}">
      <h2>${escapeHtml(course.name)}</h2>
      <span class="course-card-meta"><span>Ouvrir le cours</span><span class="course-card-arrow">→</span></span>
    </button>
  `).join('');
  elements.courseGrid.querySelectorAll('[data-course-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedCourseId = button.dataset.courseId;
      showView('course');
    });
  });
}

async function renderRecordings() {
  const course = selectedCourse();
  if (!course) return;
  elements.courseTitle.textContent = course.name;
  const recordings = await getCourseAudio(course.id);
  elements.recordingCount.textContent = String(recordings.length);
  if (!recordings.length) {
    elements.recordingList.innerHTML = '<div class="empty-state">Aucun enregistrement dans ce cours.</div>';
    return;
  }
  elements.recordingList.innerHTML = recordings.sort((a, b) => b.createdAt - a.createdAt).map((recording) => `
    <article class="recording-item">
      <div>
        <p class="recording-title">${escapeHtml(recording.name)}</p>
        <span class="recording-meta">${formatDate(recording.createdAt)} · ${formatDuration(recording.duration)}</span>
      </div>
      <div class="recording-actions">
        <audio class="audio-player" controls src="${URL.createObjectURL(recording.file)}"></audio>
        <a class="action-button" href="${URL.createObjectURL(recording.file)}" download="${escapeHtml(recording.name)}" aria-label="Télécharger ${escapeHtml(recording.name)}" title="Télécharger">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
        <button class="action-button danger" data-delete-recording="${recording.id}" type="button" aria-label="Supprimer l'enregistrement" title="Supprimer">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M10 11v5M14 11v5M8 7l.7-2h6.6l.7 2m-10 0 .7 13h10.6l.7-13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </article>
  `).join('');
  elements.recordingList.querySelectorAll('[data-delete-recording]').forEach((button) => {
    button.addEventListener('click', async () => {
      await deleteAudio(button.dataset.deleteRecording);
      showToast('Enregistrement supprimé');
      renderRecordings();
    });
  });
}

function render() {
  renderCourses();
  if (state.view === 'course') renderRecordings();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(timestamp);
}

function formatDuration(seconds = 0) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

function audioName(file) {
  return file.name.replace(/\.[^/.]+$/, '') || 'Enregistrement';
}

async function storeAudio(file, duration = 0) {
  await saveAudio({ id: createId(), courseId: selectedCourse().id, name: audioName(file), file, duration, createdAt: Date.now() });
  showToast('Enregistrement ajouté');
  renderRecordings();
}

async function toggleRecording() {
  if (state.recording) {
    state.recording.mediaRecorder.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showToast('L’enregistrement audio n’est pas disponible ici');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    const chunks = [];
    const startedAt = Date.now();
    mediaRecorder.ondataavailable = (event) => chunks.push(event.data);
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      const extension = blob.type.includes('mp4') ? 'm4a' : 'webm';
      const file = new File([blob], `Enregistrement-${new Date().toISOString().slice(0, 10)}.${extension}`, { type: blob.type });
      await storeAudio(file, (Date.now() - startedAt) / 1000);
      state.recording = null;
      updateRecordingControls();
    };
    mediaRecorder.start();
    state.recording = { mediaRecorder };
    updateRecordingControls();
  } catch {
    showToast('Accès au microphone refusé');
  }
}

function updateRecordingControls() {
  const isRecording = Boolean(state.recording);
  elements.recordBtn.classList.toggle('is-recording', isRecording);
  elements.recordButtonLabel.textContent = isRecording ? 'Arrêter' : 'Démarrer';
  elements.recordingStatus.textContent = isRecording ? 'En cours' : 'Prêt';
  elements.recordingStatus.classList.toggle('is-recording', isRecording);
}

elements.courseForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = elements.courseNameInput.value.trim();
  if (!name) return;
  elements.courseForm.dataset.mode === 'rename' ? renameCourse(name) : createCourse(name);
});
document.getElementById('headerAddCourseBtn').addEventListener('click', () => openCourseModal('create'));
document.getElementById('navAddCourseBtn').addEventListener('click', () => openCourseModal('create'));
document.getElementById('closeModalBtn').addEventListener('click', closeCourseModal);
document.getElementById('backToCoursesBtn').addEventListener('click', () => showView('home'));
document.getElementById('renameCourseBtn').addEventListener('click', () => openCourseModal('rename'));
document.getElementById('deleteCourseBtn').addEventListener('click', removeCourse);
elements.recordBtn.addEventListener('click', toggleRecording);
document.getElementById('uploadBtn').addEventListener('click', () => elements.audioFileInput.click());
elements.audioFileInput.addEventListener('change', async () => {
  const file = elements.audioFileInput.files[0];
  if (file && selectedCourse()) await storeAudio(file);
  elements.audioFileInput.value = '';
});
document.querySelectorAll('[data-target-view]').forEach((item) => item.addEventListener('click', () => {
  if (item.dataset.targetView === 'course' && !selectedCourse()) return showToast('Sélectionnez un cours');
  showView(item.dataset.targetView);
}));
elements.courseModal.addEventListener('click', (event) => {
  if (event.target === elements.courseModal) closeCourseModal();
});

if (state.courses.length) state.selectedCourseId = state.courses[0].id;
render();
