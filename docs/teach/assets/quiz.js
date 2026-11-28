// Shared quiz widget for lessons.
// Usage: <div class="quiz" data-quiz>
//   <h4>Question</h4>
//   <div class="quiz-question">
//     <label><input type="radio" name="q1" value="correct"> Answer A</label>
//     <label><input type="radio" name="q1" value="wrong"> Answer B</label>
//   </div>
//   <div class="quiz-feedback" data-correct="correct">Explanation here</div>
// </div>
(function () {
  document.querySelectorAll('[data-quiz]').forEach(function (quiz) {
    var feedback = quiz.querySelector('.quiz-feedback');
    if (!feedback) return;
    var correctVal = feedback.dataset.correct;
    quiz.querySelectorAll('input[type="radio"]').forEach(function (input) {
      input.addEventListener('change', function () {
        feedback.classList.remove('correct', 'wrong');
        if (input.value === correctVal) {
          feedback.classList.add('correct');
        } else {
          feedback.classList.add('wrong');
        }
      });
    });
  });
})();
