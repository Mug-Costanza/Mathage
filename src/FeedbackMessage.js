import React from 'react';
import './FeedbackMessage.css'; // We'll create this CSS file

const FeedbackMessage = ({ text, type }) => {
  return (
    <span className={`feedback-message ${type}`}>
      {text}
    </span>
  );
};

export default FeedbackMessage;
