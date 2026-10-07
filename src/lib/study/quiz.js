export function gradeReading(reading, answers) {
  if (!Array.isArray(answers) || answers.length !== reading.q.length || !reading.q.length) return null;
  if (answers.some((answer, index) => !Number.isInteger(answer) || answer < 0 || answer >= reading.q[index].o.length)) return null;
  return { score: answers.filter((answer, index) => answer === reading.q[index].a).length, total: answers.length };
}
