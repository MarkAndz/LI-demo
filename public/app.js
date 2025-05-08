const form = document.getElementById('commentForm');
const list = document.getElementById('commentList');
let comments = [];

//Render comments
function render() {
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

//Fetch and display existing comments
async function loadComments() {
    const res = await fetch('/comments');
    comments = await res.json();
    render();
}

// New comments
form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = form.text.value;

    const res = await fetch('/comments', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ text })
    });
    const payload = await res.json();

    if (!res.ok) {
        return alert(payload.error || 'Failed to add comment');
    }

    //Reload
    await loadComments();
    form.reset();
});

//Edit delete buttons
list.addEventListener('click', async e => {
    const btn = e.target;
    const id  = btn.dataset.id;
    if (btn.dataset.action === 'edit') {
        const current = comments.find(c => c.id == id).text;
        const newText = prompt('New text?', current);
        if (!newText) return;
        const res = await fetch(`/comments/${id}`, {
            method: 'PUT',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ text: newText })
        });
        const updated = await res.json();
        comments = comments.map(c => c.id == id ? updated : c);
        render();
    }
    if (btn.dataset.action === 'delete') {
        await fetch(`/comments/${id}`, { method: 'DELETE' });
        comments = comments.filter(c => c.id != id);
        render();
    }
});


loadComments();
