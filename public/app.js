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


//Pie chart render
function renderEmotionChart() {
    //suminu emotions
    let totals = {};
    for (let i = 0; i < comments.length; i++) {
        let emo = comments[i].emotion;
        for (let label in emo) {
            if (totals[label]) {
                totals[label] += emo[label];
            } else {
                totals[label] = emo[label];
            }
        }
    }


    let labels = [];
    let data   = [];
    for (let key in totals) {
        labels.push(key);
        data.push(totals[key]);
    }

    //
    var ctx = emotionChartEl.getContext('2d');
    if (emotionChart) {
        emotionChart.destroy();
    }
    emotionChart = new Chart(ctx, {
        type: 'pie',
        data:
            {
            labels: labels,
            datasets: [{
                data: data
            }]
        },
        options: {
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

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

    //no full page restart por favor
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

    //Sending json + string
    const res = await fetch('/projects', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ name, password: pwd })
    });

    //parsing json to something usable
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

    //Objects turned to HTML+displayed
    projectSelect.innerHTML = projects
        .map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}
loadProjects();

// Join a project (uses loadComments under the hood)
joinBtn.addEventListener('click', async () => {
    projectId  = projectSelect.value;
    projectPwd = projectPassword.value.trim();
    if (!projectPwd) {
        alert('Please enter the project password.');
        return;
    }

    if (!await loadComments()) return;

    //unhide section first
    projectLogin.style.display    = 'none';
    commentsSection.style.display = '';

    //Piesiammm
    emotionChartEl.style.display = 'block';
    renderEmotionChart();

    //Title from form +comm
    projectTitleEl.textContent = `${projectSelect.selectedOptions[0].text} — Comments`;
});


//sumuoju headerį authui
function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-Project-Password': projectPwd
    };
}

//Loadinu comments
async function loadComments() {
    const res = await fetch(`/projects/${projectId}/comments`, {
        headers: authHeaders()
    });
    if (!res.ok) {
        const err = await res.json().catch(()=>({}));
        alert(err.error||'Failed to load comments');
        return false;
    }
    const { comments: data, averageSentiment } = await res.json();
    comments = data;
    avgSentEl.textContent = averageSentiment.toFixed(2);
    renderComments();
    renderEmotionChart();
    return true;
}


//Render comments
function renderComments() {
    //Clear inner html (comments)
    list.innerHTML = '';

    //Looping over comments
    for (var i = 0; i < comments.length; i++) {
        var c = comments[i];
        var li = document.createElement('li');

        //Building inner html string
        var html  = '<strong>' + c.text + '</strong><br>';
        html += '<em>Sentiment:</em> '
            + c.sentiment.label
            + ' (score: '
            + c.sentiment.score.toFixed(2)
            + ')<br>';

        html += '<em>Emotions:</em> ';
        var parts = [];
        var emoObj = c.emotion;
        for (var key in emoObj) {
            if (emoObj.hasOwnProperty(key)) {
                parts.push(key + ': ' + emoObj[key].toFixed(2));
            }
        }
        html += parts.join(', ') + '<br>';

        html += '<div class="controls">';
        html +=   '<button data-action="edit" data-id="' + c.id + '">Edit</button>';
        html +=   '<button data-action="delete" data-id="' + c.id + '">Delete</button>';
        html += '</div>';

        // Insert and append
        li.innerHTML = html;
        list.appendChild(li);
    }
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

//Edit or delete
list.addEventListener('click', async function(e) {
    var btn     = e.target;
    var action  = btn.getAttribute('data-action');
    var commentId = btn.getAttribute('data-id');

    //edit
    if (action === 'edit') {
        var currentText = '';
        for (var i = 0; i < comments.length; i++) {
            if (comments[i].id == commentId) {
                currentText = comments[i].text;
                break;
            }
        }


        var newText = prompt('New text?', currentText);
        if (!newText) {
            return;
        }

        //send update
        var updateRes = await fetch(
            '/projects/' + projectId + '/comments/' + commentId,
            {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ text: newText })
            }
        );
        if (!updateRes.ok) {
            var updateErr = await updateRes.json();
            alert(updateErr.error);
            return;
        }

        //reload
        await loadComments();
        return;
    }
    //back
    backBtn.addEventListener('click', () => {
        projectPassword.value = '';
        comments = [];
        avgSentEl.textContent = '0.00';
        commentsSection.style.display = 'none';
        projectLogin.style.display    = '';
    });

    //delete
    if (action === 'delete') {
        var deleteRes = await fetch(
            '/projects/' + projectId + '/comments/' + commentId,
            {
                method: 'DELETE',
                headers: authHeaders()
            }
        );
        if (!deleteRes.ok) {
            var deleteErr = await deleteRes.json();
            alert(deleteErr.error);
            return;
        }

        //reload
        await loadComments();
        return;
    }
});

