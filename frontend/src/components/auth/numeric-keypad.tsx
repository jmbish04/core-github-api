import React, { useState } from 'react';
import { ShieldCheck, Delete } from 'lucide-react';

interface NumericKeypadProps {
    onComplete: (code: string) => void;
    length?: number;
}

export const NumericKeypad: React.FC<NumericKeypadProps> = ({ onComplete }) => {
    const [code, setCode] = useState('');

    const handlePress = (num: number) => {
        if (code.length < 32) { // Allow long API keys
            const newCode = code + num;
            setCode(newCode);
        }
    };

    const handleDelete = () => {
        setCode(prev => prev.slice(0, -1));
    };

    const handleSubmit = () => {
        if (code.length > 0) {
            onComplete(code);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
            <div className="max-w-md w-full space-y-8">
                <div className="text-center">
                    <div className="mx-auto h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                        <ShieldCheck className="h-6 w-6 text-primary" />
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">
                        Enter Worker API Key
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Please enter your numeric API key to continue.
                    </p>
                </div>

                <div className="flex justify-center my-8">
                    <div className="text-3xl font-mono tracking-widest h-12 flex items-center">
                        {code.split('').map((_, i) => (
                            <span key={i} className="mx-1">
                                •
                            </span>
                        ))}
                        {code.length === 0 && <span className="text-muted-foreground opacity-50">Enter code</span>}
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4 max-w-xs mx-auto">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                        <button
                            key={num}
                            onClick={() => handlePress(num)}
                            className="h-16 w-16 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center text-2xl font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        >
                            {num}
                        </button>
                    ))}
                    <div /> {/* Spacer */}
                    <button
                        onClick={() => handlePress(0)}
                        className="h-16 w-16 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center text-2xl font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                        0
                    </button>
                    <button
                        onClick={handleDelete}
                        className="h-16 w-16 rounded-full bg-destructive/10 hover:bg-destructive/20 text-destructive flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                        <Delete className="h-6 w-6" />
                    </button>
                </div>

                <div className="flex justify-center mt-8">
                    <button
                        onClick={handleSubmit}
                        disabled={code.length === 0}
                        className="w-full max-w-xs py-3 px-4 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Authenticate
                    </button>
                </div>
            </div>
        </div>
    );
};
