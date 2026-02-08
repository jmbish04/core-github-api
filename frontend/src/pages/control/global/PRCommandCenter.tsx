// frontend/src/pages/PRCommandCenterPage.tsx
import React from 'react';
import { PRCommandCenter as PRCommandCenterComponent } from '@/components/PRCommandCenter';

export const PRCommandCenter: React.FC = () => {
    return (
        <div className="p-4">
            <PRCommandCenterComponent />
        </div>
    );
};
