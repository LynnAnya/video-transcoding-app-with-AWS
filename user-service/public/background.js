// background.js
document.addEventListener('DOMContentLoaded', () => {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const username = localStorage.getItem('username');
    const userBgColor = localStorage.getItem(`bgColor_${username}`); 

    if (isLoggedIn === 'true' && username) {
        const container = document.querySelector('.container');
        if (container) {
          
            if (userBgColor) {
                container.style.backgroundColor = userBgColor;
            } else {
                container.style.backgroundColor = '#4070f4'; 
            }
        }
    }

    // background color change,  save to localStorage, username as key
    const saveColorBtn = document.getElementById('saveColorBtn');
    if (saveColorBtn) {
        saveColorBtn.addEventListener('click', () => {
            const selectedColor = document.querySelector('input[name="bgColor"]:checked').value;
            
            localStorage.setItem(`bgColor_${username}`, selectedColor);
            const container = document.querySelector('.container');
            container.style.backgroundColor = selectedColor;
        });
    }
});
