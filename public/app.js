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

//New project
const newNameInput     = document.getElementById('newProjectName');
const newPwdInput      = document.getElementById('newProjectPassword');
const createBtn        = document.getElementById('createProjectBtn');
const createFeedback   = document.getElementById('createFeedback');

//State
let projectId = null;
let projectPwd = '';
let comments = [];

//Create project button + validation
createBtn.addEventListener('click', async () => {
    const name = newNameInput.value.trim();
    const pwd  = newPwdInput.value.trim();

    //Name validation
    if (name.length < 5) {
        createFeedback.style.color = 'red';
        return createFeedback.textContent = 'Name must be 5+ characters in length.';
    }

    //Password validation
    const errs = [];
    if (pwd.length < 8) errs.push('8+ characters');
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
        // refresh the dropdown list
        await loadProjects();
    }
});




//Project listing and rendering
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

//Join project
joinBtn.addEventListener('click', () => {
    projectId  = projectSelect.value;
    projectPwd = projectPassword.value.trim();
    if (!projectPwd) {
        return alert('Please enter the project password.');
    }

    //Switch views
    projectLogin.style.display    = 'none';
    commentsSection.style.display = '';

    //Set header
    projectTitleEl.textContent = `${projectSelect.selectedOptions[0].text} — Comments`;

    //Load comments
    loadComments();
});


function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-Project-Password': projectPwd
    };
}

//Fetch and render comments + sentiment
async function loadComments() {
    const res = await fetch(`/projects/${projectId}/comments`, {
        headers: authHeaders()
    });
    if (!res.ok) {
        const err = await res.json();
        return alert(err.error || 'Failed to load comments');
    }
    const { comments: data, averageSentiment } = await res.json();
    comments = data;
    avgSentEl.textContent = averageSentiment.toFixed(2);
    renderComments();
}

//Render comment list
function renderComments() {
    list.innerHTML = '';
    comments.forEach(c => {
        const li = document.createElement('li');
        li.innerHTML = `
      <strong>${c.text}</strong><br>
      <em>Sentiment:</em> ${c.sentiment.label}
      (score: ${c.sentiment.score.toFixed(2)})
      <div class="controls">
        <button data-action="edit" data-id="${c.id}">Edit</button>
        <button data-action="delete" data-id="${c.id}">Delete</button>
      </div>
    `;
        list.appendChild(li);
    });
}

//Add new comment
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

//Edit/delete comment
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
