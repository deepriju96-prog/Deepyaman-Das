import React from "react";
import { signInWithGoogle, logout, auth, db, OperationType, handleFirestoreError } from "../firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { LogIn, LogOut, User } from "lucide-react";

const Auth: React.FC = () => {
  const [user, loading, error] = useAuthState(auth);

  const handleSignIn = async () => {
    try {
      const result = await signInWithGoogle();
      if (result.user) {
        // Initialize user profile if it doesn't exist
        const userRef = doc(db, "users", result.user.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            name: result.user.displayName || "Anonymous",
            email: result.user.email || "",
            role: "user"
          });
        }
      }
    } catch (err) {
      console.error("Sign in failed:", err);
    }
  };

  if (loading) return <div className="text-sm text-gray-500">Loading auth...</div>;
  if (error) return <div className="text-sm text-red-500">Auth Error: {error.message}</div>;

  if (user) {
    return (
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {user.photoURL ? (
            <img src={user.photoURL} alt={user.displayName || "User"} className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
              <User className="w-4 h-4 text-gray-500" />
            </div>
          )}
          <span className="text-sm font-medium text-gray-700 hidden sm:inline">{user.displayName}</span>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleSignIn}
      className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all"
    >
      <LogIn className="w-4 h-4" />
      <span>Sign in with Google</span>
    </button>
  );
};

export default Auth;
