/** Photo gallery arrows/dots for static spot pages (same behaviour as in-app Path 3). */
(function initStaticPhotoGalleries() {
  document.querySelectorAll(".photo-gallery").forEach((gallery) => {
    const track = gallery.querySelector(".photo-gallery__track");
    const dots = [...gallery.querySelectorAll(".photo-gallery__dot")];
    const count = dots.length;
    if (!track || count < 2) return;

    let index = 0;
    const goTo = (next) => {
      index = (next + count) % count;
      track.style.transform = `translateX(-${index * 100}%)`;
      dots.forEach((dot, i) => dot.classList.toggle("is-active", i === index));
    };

    gallery.querySelector(".photo-gallery__arrow--prev")?.addEventListener("click", (e) => {
      e.preventDefault();
      goTo(index - 1);
    });
    gallery.querySelector(".photo-gallery__arrow--next")?.addEventListener("click", (e) => {
      e.preventDefault();
      goTo(index + 1);
    });
    dots.forEach((dot, i) => {
      dot.addEventListener("click", (e) => {
        e.preventDefault();
        goTo(i);
      });
    });
  });
})();
