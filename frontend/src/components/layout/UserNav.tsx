import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut } from "lucide-react";

export function UserNav() {
    const { isAuthenticated, logout } = useAuth();
    const navigate = useNavigate();

    if (isAuthenticated) {
        return (
            <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => logout()}
                className="gap-2 text-muted-foreground hover:text-foreground"
            >
                <LogOut className="h-4 w-4" />
                Logout
            </Button>
        );
    }

    return (
        <Button 
            variant="default" 
            size="sm" 
            onClick={() => navigate('/login')}
            className="gap-2"
        >
            <LogIn className="h-4 w-4" />
            Login
        </Button>
    );
}
