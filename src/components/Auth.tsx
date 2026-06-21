import React, { useState } from "react";
import { 
  signInWithGoogle, 
  loginWithEmail, 
  registerWithEmail, 
  loginAsGuest, 
  logout, 
  auth, 
  db 
} from "../firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { LogIn, LogOut, User, Mail, Lock, UserPlus, Sparkles, ShieldAlert, Loader2 } from "lucide-react";

const Auth: React.FC = () => {
  const [user, loading, authError] = useAuthState(auth);
  
  // Tab states for non-logged-in views
  const [activeTab, setActiveTab] = useState<"email" | "register" | "guest" | "google">("email");
  
  // Form input states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  
  // UI states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Helper to safely write user to Firestore db
  const initializeUserProfile = async (firebaseUser: any, defaultName: string) => {
    try {
      const userRef = doc(db, "users", firebaseUser.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          name: firebaseUser.displayName || defaultName,
          email: firebaseUser.email || "",
          role: "user"
        });
      }
    } catch (dbErr) {
      console.warn("Could not save initial user profile to db (probably normal for temporary guest limitations):", dbErr);
    }
  };

  // Google Authentication handler
  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await signInWithGoogle();
      if (result.user) {
        await initializeUserProfile(result.user, result.user.displayName || "Google User");
      }
    } catch (err: any) {
      console.error("Sign in failed:", err);
      let errMsg = err.message || "Credential authentication failed.";
      if (err.code === "auth/unauthorized-domain") {
        errMsg = "Vercel / domain unauthorized! Add this domain to 'Authorized Domains' inside your Firebase Console, or log in with Guest/Email mode.";
      } else if (err.code === "auth/popup-closed-by-user") {
        errMsg = "Google login popup closed before authentication completed.";
      }
      setErrorMessage(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Email and Password Login handler
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage("Please enter both email and password.");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await loginWithEmail(email, password);
      if (result.user) {
        await initializeUserProfile(result.user, result.user.email?.split("@")[0] || "User");
      }
    } catch (err: any) {
      console.error("Email login failed:", err);
      let errMsg = err.message || "Invalid email or password.";
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        errMsg = "Wrong email/password combination. Try registering if you are new.";
      } else if (err.code === "auth/invalid-credential") {
        errMsg = "Invalid password. Try again or check your spelling.";
      }
      setErrorMessage(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Email Register handler
  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !fullName) {
      setErrorMessage("Please provide email, password and your full name.");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await registerWithEmail(email, password);
      if (result.user) {
        await initializeUserProfile(result.user, fullName);
      }
    } catch (err: any) {
      console.error("Registration failed:", err);
      let errMsg = err.message || "Registration failed. Please check details.";
      if (err.code === "auth/email-already-in-use") {
        errMsg = "An account already exists with this email address.";
      }
      setErrorMessage(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Instant Guest Login handler
  const handleGuestLogin = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await loginAsGuest();
      if (result.user) {
        await initializeUserProfile(result.user, "Guest Professional");
      }
    } catch (err: any) {
      console.error("Guest login failed:", err);
      setErrorMessage(err.message || "Unable to start a guest session.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
        <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
        <span>Loading session...</span>
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {user.photoURL ? (
            <img 
              src={user.photoURL} 
              alt={user.displayName || "User"} 
              className="w-8 h-8 rounded-full border border-gray-100" 
              referrerPolicy="no-referrer" 
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
              <User className="w-4 h-4 text-indigo-600" />
            </div>
          )}
          <span className="text-sm font-semibold text-gray-750 hidden sm:inline">
            {user.displayName || "Member"}
          </span>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-gray-650 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col font-sans text-left mt-2" id="auth-panel-container">
      {/* Tab Selectors */}
      <div className="flex border-b border-gray-100 dark:border-slate-800 mb-5 p-1 bg-slate-50 dark:bg-slate-900/60 rounded-xl">
        <button
          type="button"
          onClick={() => { setActiveTab("email"); setErrorMessage(null); }}
          className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === "email"
              ? "bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400"
              : "text-gray-400 hover:text-gray-700 dark:text-slate-400"
          }`}
        >
          Email Sign In
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab("register"); setErrorMessage(null); }}
          className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === "register"
              ? "bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400"
              : "text-gray-400 hover:text-gray-700 dark:text-slate-400"
          }`}
        >
          Register
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab("guest"); setErrorMessage(null); }}
          className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === "guest"
              ? "bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400"
              : "text-gray-400 hover:text-gray-700 dark:text-slate-400"
          }`}
        >
          Guest Demo
        </button>
      </div>

      {/* Error Output block */}
      {(errorMessage || authError) && (
        <div className="mb-4 p-3.5 bg-red-50 dark:bg-red-950/20 border border-red-155 dark:border-red-900/30 rounded-xl text-left flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-red-655 shrink-0 mt-0.5" />
          <div className="text-xs text-red-650 leading-relaxed font-semibold">
            {errorMessage || authError?.message}
          </div>
        </div>
      )}

      {/* EMAIL SIGN IN FORM */}
      {activeTab === "email" && (
        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-gray-150 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                required
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-gray-150 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Signing In...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Sign In with Email</span>
              </>
            )}
          </button>
        </form>
      )}

      {/* REGISTER FORM */}
      {activeTab === "register" && (
        <form onSubmit={handleEmailRegister} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Full Name</label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                required
                placeholder="Your Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-gray-150 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-gray-150 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Password (min 6 chars)</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                required
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-gray-150 dark:border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 transition cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating Account...</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Register with Email</span>
              </>
            )}
          </button>
        </form>
      )}

      {/* GUEST DEMO MODE */}
      {activeTab === "guest" && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500 leading-relaxed bg-indigo-50/50 dark:bg-indigo-950/20 p-4 rounded-xl border border-indigo-100/30">
            <strong>Bypass logins or Authorized Domain limits completely!</strong> Accessing via Vercel means Google popup-based logins may fail. Instant Guest / Demo Mode allows one-click entrance with temporary persistent sessions.
          </p>
          <button
            type="button"
            onClick={handleGuestLogin}
            disabled={isSubmitting}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-650 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-sm font-bold shadow-lg flex items-center justify-center gap-2.5 transition cursor-pointer active:scale-95"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-yellow-300" />
            )}
            <span>Enter as Guest (One-Click)</span>
          </button>
        </div>
      )}

      {/* Divider */}
      <div className="flex items-center gap-3 my-5 text-gray-300 dark:text-slate-850">
        <hr className="flex-1 border-t border-gray-100" />
        <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400 shrink-0">Or Google Auth</span>
        <hr className="flex-1 border-t border-gray-100" />
      </div>

      {/* GOOGLE login option */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isSubmitting}
        className="w-full flex items-center justify-center gap-2.5 px-4 py-3 bg-white hover:bg-gray-50 dark:bg-slate-900 border border-gray-200 hover:border-gray-300 dark:border-slate-800 rounded-xl shadow-xs text-sm font-bold text-gray-700 dark:text-slate-200 outline-none transition-all cursor-pointer"
      >
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
        </svg>
        <span>Sign in with Google</span>
      </button>

      {/* Informative Help Footer tip */}
      <p className="mt-4 text-[10px] font-semibold text-gray-400 text-center leading-normal">
        * Firebase dynamic Google single sign-on constraints apply under Vercel redirects inside iframes.
      </p>
    </div>
  );
};

export default Auth;
