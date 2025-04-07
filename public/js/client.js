// public/js/client.js

// 1. Wait for DOM and Socket.IO to be ready
document.addEventListener('DOMContentLoaded', () => {
    const socket = io(); // Connect to server
  
    // 2. Safely get elements with null checks
    const getElement = (id) => {
      const el = document.getElementById(id);
      if (!el) console.error(`Missing #${id} element`);
      return el;
    };
  
    const answerForm = getElement('answerForm');
    const answerInput = getElement('answer'); //Corrected this line
    const takePhotoBtn = getElement('takePhotoButton');
    const submitBtn = getElement('submitAnswer');

    // Add this debugging code
console.log("Answer input value:", answerInput.value);
console.log("Trimmed value:", answerInput.value.trim());
console.log("Is empty?", answerInput.value.trim() === "");

    answerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Debugging
        const rawValue = answerInput.value;
        const trimmedValue = rawValue.trim();
        console.log("Validation Debug:", {
          rawValue,
          trimmedValue,
          isEmpty: trimmedValue === "",
          isWhitespace: rawValue !== trimmedValue
        });
    });
      
        // Fixed validation
        if (!trimmedValue) {
          alert("✏️ Please type your answer (empty or just spaces won't work)");
          answerInput.focus();
          return;
        }
  
    // 3. State management
    const state = {
      pictureTaken: false,
      currentPicture: null,
      currentPlayer: 1
    };
  
    // 4. Photo capture handler
    takePhotoBtn?.addEventListener('click', () => {
      const canvas = getElement('photoCanvas');
      const video = getElement('cameraPreview');
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      
      state.pictureTaken = true;
      state.currentPicture = canvas.toDataURL('image/jpeg');
      submitBtn.disabled = false;
    });
  
    // 5. Form submission (FIXED VERSION)
    answerForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      
      // Debug: Verify values
      console.log('Current state:', {
        pictureTaken: state.pictureTaken,
        answerValue: answerInput.value.trim()
      });
  
      // Validation
      if (!state.pictureTaken) {
        alert("📸 You must take a picture first!");
        return;
      }
  
      if (!answerInput.value.trim()) {
        alert("✏️ Please type your answer!");
        answerInput.focus();
        return;
      }
  
      // Submit to server
      socket.emit('submitAnswer', {
        player: state.currentPlayer,
        answer: answerInput.value.trim(),
        picture: state.currentPicture
      });
  
      // Reset form
      answerInput.value = '';
      state.pictureTaken = false;
      submitBtn.disabled = true;
    });
    }
)