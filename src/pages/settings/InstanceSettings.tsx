import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import EvolutionModal from '../../components/EvolutionModal';

export default function InstanceSettings() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="w-full h-full min-h-[85vh] flex items-center justify-center p-4">
      <EvolutionModal
        isOpen={true}
        onClose={() => {
          if (window.history.length > 1) {
            navigate(-1);
          } else {
            navigate('/instances');
          }
        }}
        targetInstanceName={id}
      />
    </div>
  );
}
