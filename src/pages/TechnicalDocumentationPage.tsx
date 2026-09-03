import React from 'react';
import { useNavigate } from 'react-router-dom';
import TechnicalDocumentationModal from '../components/modals/TechnicalDocumentationModal';

export default function TechnicalDocumentationPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <TechnicalDocumentationModal 
        isOpen={true} 
        onClose={() => {
          if (window.history.length > 1) {
            navigate(-1);
          } else {
            navigate('/chat');
          }
        }} 
      />
    </div>
  );
}
