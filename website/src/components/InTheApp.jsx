import SettingsGuide from './SettingsGuide.jsx';
import Gallery from './Gallery.jsx';

export default function InTheApp() {
  return (
    <section className="section" id="in-the-app" aria-labelledby="in-the-app-heading">
      <div className="section__head">
        <p className="section__num">02 / In the app</p>
        <h2 id="in-the-app-heading" className="section__title">
          A guided tour of the settings.
        </h2>
        <p className="section__lead">
          Explore the settings guide, then take a closer look at the actual app screens.
        </p>
      </div>

      <SettingsGuide />
      <Gallery />
    </section>
  );
}
