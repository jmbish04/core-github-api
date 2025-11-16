import Message from "./Message";
import Composer from "./Composer";

export default function ChatPanel() {
  return (
    <div className="flex flex-col border-r border-white/10 bg-[#111722]">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <Message
          author="Automation Agent"
          avatarUrl="https://lh3.googleusercontent.com/aida-public/AB6AXuCzeCc7nwky_r3Ridd90yxXIdHQkxbLP6QiCsJWPqo6LY5K34yGY6eAHuKQluCLDWYE6nkcEdvA-iUeglzhoBXn5tFvXj9ygaSM6p8MBFinLg7XW86bRtkL1t-QQjmxHPDmE3DGDqEkPhmiKkkdAkzXa03Dl7ess30YmZPi9xKOwnANhXGi1HXsKhh4NtrtUYcJ47ggzNh0i40c66T9SS98APKXouSZmAS7PosKUCw2mMOeIPW4i6fN3Pcr9Uj3u7v_nDGrXYA7iM9c"
        >
          Welcome! I can help you automate your GitHub workflows. What would you like to build today?
        </Message>
        <Message
          author="DevOps Manager"
          avatarUrl="https://lh3.googleusercontent.com/aida-public/AB6AXuAMhxF6N0UWP_FCG9hN8ADIl0PLpOWth5isQzuV772rytqn4sA23EvdqLWUGoRQ7h6R_A1B-Zz-YryLV2OjQgYuKQFrljBZE3tPh3k8c4sHadrEVt56KPk8aWjJHiapRV-3BHjar0dcv4GVp2jcLyJuuVbQG1JsfvqxEspWID3V3pfDsLnpU7FOxaLWdKOglQfFrvLm3uIBtXlxhTvv7kkzJiDDm2Mm-Fb2aHMkY2Y2clSCz3D1wQFAOWKyGue1HiyMFhEnm541Uk5T"
          isUser
        >
          When an issue is created with the label 'bug', have an agent try to reproduce it and post the results as a comment.
        </Message>
        <Message
          author="Automation Agent"
          avatarUrl="https://lh3.googleusercontent.com/aida-public/AB6AXuBMrwG1n_38aFiCEpe9bYN-8rDxSyUdoAW_ofye-fFS8q2zEmJsny0ZbGUa7ehxexrRkweU5WlKOh-SDL3j4Cp4C6bbdLW57Vrn4s4afVl4uiKihw35U8v6yIYrvUaIfnDcfSNQwUIuDxj13W_F2bUbV0hAqrYf-8KS8NRBajPompc-GiOoN9Jj2TwLmMbPSTWFLsUAo6PJuWV8DRBZXjQW_IaJrxtGxmZVeDZchygP5KuO2sID8gdQ5HdZ3E_p6BlPD50L0vXZXuTQ"
        >
          OK, I've drafted the changes to the webhook handler. Review the code diff and submit it as a PR when you're ready.
        </Message>
      </div>
      <Composer />
    </div>
  )
}
