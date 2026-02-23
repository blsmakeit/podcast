import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Unlock, ShieldAlert } from "lucide-react";

const ADMIN_PASSWORD = "MIcompany2020";
const SESSION_KEY = "mk_admin";

const BackofficeContext = createContext({
  isAdmin: false,
  openLogin: () => {},
  logout: () => {},
});

export function useBackoffice() {
  return useContext(BackofficeContext);
}

export function BackofficeProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");
  const [showModal, setShowModal] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const openLogin = useCallback(() => {
    setPassword("");
    setError(false);
    setShowModal(true);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setIsAdmin(false);
  }, []);

  const handleUnlock = () => {
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, "1");
      setIsAdmin(true);
      setShowModal(false);
      setError(false);
      setPassword("");
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleUnlock();
  };

  return (
    <BackofficeContext.Provider value={{ isAdmin, openLogin, logout }}>
      {children}

      <Dialog open={showModal} onOpenChange={(open) => { if (!open) { setShowModal(false); setError(false); setPassword(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              Backoffice Access
            </DialogTitle>
            <DialogDescription>
              Enter the administrator password to access backoffice controls.
            </DialogDescription>
          </DialogHeader>
          <div className={`space-y-4 ${shake ? "animate-shake" : ""}`}>
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              onKeyDown={handleKeyDown}
              autoFocus
              className={error ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {error && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <ShieldAlert className="w-4 h-4" />
                Incorrect password. Please try again.
              </p>
            )}
            <Button onClick={handleUnlock} className="w-full">
              <Unlock className="w-4 h-4 mr-2" />
              Unlock Backoffice
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </BackofficeContext.Provider>
  );
}
