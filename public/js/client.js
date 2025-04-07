document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // Element getter with null checks
    const getElement = (id) => {
        const el = document.getElementById(id);
        if (!el) console.error(`Missing #${id} element`);
        return el;
    };

    // Get elements
    const answerForm = getElement('answerForm');
    const answerInput = getElement('answer');
    const takePhotoBtn = getElement('takePhotoButton');
    const submitBtn = getElement('submitAnswer');

    // State management
    const state = {
        pictureTaken: false,
        currentPicture: null,
        currentPlayer: 1
    };

    // MOVED DEBUG LOGS INSIDE EVENT HANDLERS WHERE THEY BELONG

    // Photo capture handler
    takePhotoBtn?.addEventListener('click', () => {
        const canvas = getElement('photoCanvas');
        const video = getElement('cameraPreview');
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        
        state.pictureTaken = true;
        state.currentPicture = canvas.toDataURL('image/jpeg');
        submitBtn.disabled = false;
        
        // Debug current state
        console.log("Photo taken. Current state:", {
            pictureTaken: state.pictureTaken,
            answerValue: answerInput.value.trim()
        });
    });

    // Form submission handler
    answerForm?.addEventListener('submit', (e) => {
        e.preventDefault();

        const rawValue = answerInput.value;
        const trimmedValue = rawValue.trim(); // Now properly defined before use

        // Debugging logs - NOW IN THE CORRECT SCOPE
        console.log("Form submission debug:", {
            rawValue,
            trimmedValue,
            isEmpty: trimmedValue === "",
            isWhitespace: rawValue !== trimmedValue
        });

        // Validation
        if (!state.pictureTaken) {
            alert("📸 You must take a picture first!");
            return;
        }

        if (!trimmedValue) {
            alert("✏️ Please type your answer!");
            answerInput.focus();
            return;
        }

        // Submit to server
        socket.emit('submitAnswer', {
            player: state.currentPlayer,
            answer: trimmedValue,
            picture: state.currentPicture
        });

        // Reset form
        answerInput.value = '';
        state.pictureTaken = false;
        submitBtn.disabled = true;
    });
});