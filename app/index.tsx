export default function Home() {
    return (
        <div className="home">
            <h1>SignLink <span>EMS</span></h1>
            <p>Connect with ASL support for emergency care</p>
            <button onClick={() => window.location.href = "/call"}> 
                Start Call
            </button>
        </div>
    );
}
