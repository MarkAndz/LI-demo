//Login
const projectLogin     = document.getElementById('projectLogin');
const projectSelect    = document.getElementById('projectSelect');
const projectPassword  = document.getElementById('projectPassword');
const joinBtn          = document.getElementById('joinBtn');

//Project comments
const commentsSection  = document.getElementById('commentsSection');
const projectTitleEl   = document.getElementById('projectTitle');
const avgSentEl        = document.getElementById('avgSent');
const form             = document.getElementById('commentForm');
const list             = document.getElementById('commentList');
const backBtn          = document.getElementById('backBtn');
const deleteProjectBtn = document.getElementById('deleteProjectBtn');
const uploadForm     = document.getElementById('uploadForm');
const uploadFeedback = document.getElementById('uploadFeedback');


//Pie chart
const emotionChartEl = document.getElementById('emotionChart');
let emotionChart;

//New project
const newNameInput   = document.getElementById('newProjectName');
const newPwdInput    = document.getElementById('newProjectPassword');
const createBtn      = document.getElementById('createProjectBtn');
const createFeedback = document.getElementById('createFeedback');

//State
let projectId  = null;
let projectPwd = '';
let comments   = [];

/** Renders the emotion pie chart */
function renderEmotionChart() {
    // Sum up emotions
    const totals = comments.reduce((agg, c) => {
        Object.entries(c.emotion).forEach(([e, v]) => {
            agg[e] = (agg[e] || 0) + v;
        });
        return agg;
    }, {});

    const labels = Object.keys(totals);
    const data   = Object.values(totals);

    const config = {
        type: 'pie',
        data: { labels, datasets: [{ data }] },
        options: { plugins: { legend: { position: 'bottom' } } }
    };

    if (emotionChart) emotionChart.destroy();
    emotionChart = new Chart(emotionChartEl.getContext('2d'), config);
}

// Back to projects
backBtn.addEventListener('click', () => {
    projectPassword.value = '';
    comments = [];
    avgSentEl.textContent = '0.00';
    commentsSection.style.display = 'none';
    projectLogin.style.display    = '';
});

// Delete project
deleteProjectBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to DELETE this project and all its comments?')) return;

    const res = await fetch(`/projects/${projectId}`, {
        method: 'DELETE',
        headers: authHeaders()
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return alert(err.error || 'Failed to delete project.');
    }

    projectPassword.value = '';
    comments = [];
    avgSentEl.textContent = '0.00';
    commentsSection.style.display = 'none';
    projectLogin.style.display    = '';
    await loadProjects();
});

//Bulk upload
uploadForm.addEventListener('submit', async e => {
    e.preventDefault();
    uploadFeedback.textContent = '';

    const fileInput = uploadForm.file;
    if (!fileInput.files.length) {
        return uploadFeedback.textContent = 'Please select a file.';
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    const res = await fetch(`/projects/${projectId}/import`, {
        method: 'POST',
        headers: { 'X-Project-Password': projectPwd },
        body: formData
    });
    const result = await res.json();
    if (!res.ok) {
        return uploadFeedback.style.color = 'red',
            uploadFeedback.textContent = result.error || 'Import failed.';
    }

    uploadFeedback.style.color = 'green';
    uploadFeedback.textContent =
        `Imported ${result.importedCount} comments, skipped ${result.skippedCount}.`;

    await loadComments();   //refresh list + chart
    uploadForm.reset();
});


// Create project
createBtn.addEventListener('click', async () => {
    const name = newNameInput.value.trim();
    const pwd  = newPwdInput.value.trim();

    if (name.length < 5) {
        createFeedback.style.color = 'red';
        return createFeedback.textContent = 'Name must be 5+ characters.';
    }

    const errs = [];
    if (pwd.length < 8) errs.push('8+ chars');
    if (!/[A-Z]/.test(pwd)) errs.push('1 uppercase');
    if (!/\d/.test(pwd)) errs.push('1 digit');
    if (errs.length) {
        createFeedback.style.color = 'red';
        return createFeedback.textContent = `Password needs ${errs.join(', ')}.`;
    }

    createFeedback.textContent = '';
    const res = await fetch('/projects', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ name, password: pwd })
    });
    const payload = await res.json();

    if (!res.ok) {
        createFeedback.style.color = 'red';
        createFeedback.textContent = payload.error;
    } else {
        createFeedback.style.color = 'green';
        createFeedback.textContent = `Project “${payload.name}” created!`;
        newNameInput.value = '';
        newPwdInput.value  = '';
        await loadProjects();
    }
});

// Load project list
async function loadProjects() {
    const res = await fetch('/projects');
    if (!res.ok) {
        return alert('Failed to load projects');
    }
    const projects = await res.json();
    projectSelect.innerHTML = projects
        .map(p => `<option value="${p.id}">${p.name}</option>`)
        .join('');
}
loadProjects();

// Join a project (uses loadComments under the hood)
joinBtn.addEventListener('click', async () => {
    projectId  = projectSelect.value;
    projectPwd = projectPassword.value.trim();
    if (!projectPwd) {
        return alert('Please enter the project password.');
    }

    try {
        await loadComments();  // unified fetch + render + chart
    } catch {
        return; // loadComments has already alerted on failure
    }

    projectLogin.style.display    = 'none';
    commentsSection.style.display = '';
    projectTitleEl.textContent = `${projectSelect.selectedOptions[0].text} — Comments`;
});

// Helper for authenticated headers
function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-Project-Password': projectPwd
    };
}

// Fetch & render comments + conditional chart
async function loadComments() {
    const res = await fetch(`/projects/${projectId}/comments`, {
        headers: authHeaders()
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to load comments');
        throw new Error('Load failed');
    }

    const { comments: data, averageSentiment } = await res.json();
    comments = data;
    avgSentEl.textContent = averageSentiment.toFixed(2);

    renderComments();

    if (comments.length > 0) {
        emotionChartEl.style.display = '';
        renderEmotionChart();
    } else {
        emotionChartEl.style.display = 'none';
    }
}

// Render comment list (with sentiment & emotion)
function renderComments() {
    list.innerHTML = '';
    comments.forEach(c => {
        const li = document.createElement('li');
        li.innerHTML = `
      <strong>${c.text}</strong><br>
      <em>Sentiment:</em> ${c.sentiment.label}
      (score: ${c.sentiment.score.toFixed(2)})<br>
      <em>Emotions:</em> ${
            Object.entries(c.emotion)
                .map(([e, v]) => `${e}: ${v.toFixed(2)}`)
                .join(', ')
        }<br>
      <div class="controls">
        <button data-action="edit" data-id="${c.id}">Edit</button>
        <button data-action="delete" data-id="${c.id}">Delete</button>
      </div>
    `;
        list.appendChild(li);
    });
}

// Add a new comment
form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = form.text.value.trim();

    const res = await fetch(`/projects/${projectId}/comments`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ text })
    });
    const payload = await res.json();
    if (!res.ok) {
        return alert(payload.error);
    }
    await loadComments();
    form.reset();
});

// Edit/Delete comment
list.addEventListener('click', async e => {
    const btn = e.target;
    const id  = btn.dataset.id;

    if (btn.dataset.action === 'edit') {
        const current = comments.find(c => c.id == id).text;
        const newText = prompt('New text?', current);
        if (!newText) return;

        const res = await fetch(`/projects/${projectId}/comments/${id}`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ text: newText })
        });
        if (!res.ok) {
            const err = await res.json();
            return alert(err.error);
        }
        await loadComments();
    }

    if (btn.dataset.action === 'delete') {
        const res = await fetch(`/projects/${projectId}/comments/${id}`, {
            method: 'DELETE',
            headers: authHeaders()
        });
        if (!res.ok) {
            const err = await res.json();
            return alert(err.error);
        }
        await loadComments();
    }
});
