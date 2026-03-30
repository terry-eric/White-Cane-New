export function createLockController(lockScreen, unlockBar) {
    let startX = 0;
    let percentage = 0;

    function resetBar() {
        unlockBar.style.width = "0%";
        unlockBar.innerText = "0%";
    }

    function startPoint(e) {
        startX = e.pageX;
    }

    function unlock() {
        if (percentage >= 95) {
            lockScreen.classList.toggle("hidden");
        }
        resetBar();
        percentage = 0;
    }

    function lock() {
        lockScreen.classList.toggle("hidden");
        resetBar();
    }

    function positionBarCal(e) {
        const deltaX = startX - e.pageX;
        percentage = parseInt((deltaX / (window.screen.width * 0.5)) * 100, 10);

        if (percentage < -100) {
            percentage = 100;
        } else if (percentage > 0) {
            percentage = 0;
        }

        unlockBar.style.width = `${Math.abs(percentage)}%`;
        unlockBar.innerText = `${Math.abs(percentage)}%`;
    }

    return {
        lock,
        positionBarCal,
        startPoint,
        unlock,
    };
}
