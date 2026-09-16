"use client";

type SuggestedQuestionsProps = {
  questions: string[];
  onSelect: (question: string) => void;
  disabled?: boolean;
};

export function SuggestedQuestions({
  questions,
  onSelect,
  disabled,
}: SuggestedQuestionsProps) {
  return (
    <ul className="suggested-questions">
      {questions.map((question) => (
        <li key={question}>
          <button type="button" disabled={disabled} onClick={() => onSelect(question)}>
            {question}
          </button>
        </li>
      ))}
    </ul>
  );
}
