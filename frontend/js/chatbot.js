/* Floating Rural Connect AI chatbot */
(function(){
  function init(){
    if(document.getElementById('rc-chatbot')) return;
    const box=document.createElement('div');box.id='rc-chatbot';box.className='rc-chatbot';
    box.innerHTML=`<button class="rc-chat-toggle" id="rc-chat-toggle" aria-label="Rural Connect AI">🤖</button>
      <section class="rc-chat-panel" id="rc-chat-panel" aria-label="Rural Connect AI">
        <header class="rc-chat-header"><div><strong id="rc-chat-title">Rural Connect AI</strong><small>Multilingual rural assistant</small></div><button id="rc-chat-close" aria-label="Close">×</button></header>
        <div class="rc-chat-messages" id="rc-chat-messages"></div>
        <form class="rc-chat-form" id="rc-chat-form"><textarea id="rc-chat-input" rows="2" maxlength="1000"></textarea><button type="submit" id="rc-chat-send">Send</button></form>
      </section>`;
    document.body.appendChild(box);
    const panel=box.querySelector('#rc-chat-panel'), msgs=box.querySelector('#rc-chat-messages'), input=box.querySelector('#rc-chat-input');
    const add=(text,who)=>{const d=document.createElement('div');d.className='rc-msg '+who;d.textContent=text;msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;};
    const welcome=()=>{msgs.innerHTML='';add(rcT('chatWelcome'),'bot');}; welcome();
    box.querySelector('#rc-chat-toggle').onclick=()=>panel.classList.toggle('open');box.querySelector('#rc-chat-close').onclick=()=>panel.classList.remove('open');
    document.addEventListener('rc-language-changed',()=>{box.querySelector('#rc-chat-title').textContent=rcT('chatTitle');input.placeholder=rcT('chatPlaceholder');box.querySelector('#rc-chat-send').textContent=rcT('chatSend');welcome();});
    input.placeholder=rcT('chatPlaceholder');
    box.querySelector('#rc-chat-form').onsubmit=async e=>{e.preventDefault();const text=input.value.trim();if(!text)return;add(text,'user');input.value='';const thinking=document.createElement('div');thinking.className='rc-msg bot';thinking.textContent=rcT('chatThinking');msgs.appendChild(thinking);msgs.scrollTop=msgs.scrollHeight;try{const data=await sendChatMessage(text,rcGetLanguage());thinking.remove();add(data.answer||'No answer returned.','bot');}catch(err){thinking.remove();add(rcT('chatError'),'bot');}};
  }
  document.addEventListener('DOMContentLoaded',init);
})();
