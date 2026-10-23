import { features } from '../content.js';

export default function Features() {
  return (
    <section className="section" id="features" aria-labelledby="features-heading">
      <div className="section__head">
        <p className="section__num">01 / Features</p>
        <h2 id="features-heading" className="section__title">
          Set up your kind of session.
        </h2>
        <p className="section__lead">
          From the first throw to your next route. Pick the helpers you want and keep
          the controls close at hand.
        </p>
      </div>

      <ul className="feature-list">
        {features.map((feature, index) => (
          <li className="feature" key={feature.title}>
            <span className="feature__num" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <h3 className="feature__title">{feature.title}</h3>
            <p className="feature__body">{feature.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
